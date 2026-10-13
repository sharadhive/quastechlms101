import { promises as fs } from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import os from 'os';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { getStorage } from '@/lib/adapters/storage';

/**
 * VIDEO_TRANSCODE job handler.
 *
 * Converts uploaded videos to MP4 (H.264 + AAC) if they aren't already in a
 * browser-universal format. This ensures every browser can play the video
 * without codec issues (MOV, MKV, WebM → MP4).
 *
 * Flow:
 *  1. Download the original file from storage (local disk or R2) to a temp dir
 *  2. Run FFmpeg to convert to MP4 (H.264 + AAC, faststart for streaming)
 *  3. Upload the converted MP4 back to storage with a new key
 *  4. Update the Material row: new fileKey, sizeBytes, status = 'published'
 *  5. Delete the original file from storage (clean up)
 *  6. Clean up temp files
 *
 * If the file is already MP4 with H.264, we still run a quick remux pass to add
 * the 'faststart' flag (moov atom at the front) which enables instant playback
 * without waiting for the full download.
 */

/** Extensions that are already MP4 (but may still need remux for faststart). */
const MP4_EXTS = new Set(['mp4', 'm4v']);
/** Extensions that definitely need full transcoding. */
const NON_MP4_EXTS = new Set(['mov', 'webm', 'mkv']);

/** Find FFmpeg binary — checks common install locations. */
function ffmpegPath(): string {
  return process.env.FFMPEG_PATH ?? 'ffmpeg';
}

/** Run a command and return { code, stdout, stderr }. */
function run(cmd: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }));
    proc.on('error', (e) => resolve({ code: 1, stdout: '', stderr: e.message }));
  });
}

/** Probe a file to check codec info. Returns null if ffprobe is unavailable. */
async function probe(filePath: string): Promise<{ vcodec: string; acodec: string; hasMoov: boolean } | null> {
  const ffprobe = process.env.FFPROBE_PATH ?? 'ffprobe';
  const { code, stdout } = await run(ffprobe, [
    '-v', 'quiet', '-print_format', 'json', '-show_streams', '-show_format', filePath,
  ]);
  if (code !== 0) return null;
  try {
    const info = JSON.parse(stdout);
    const vs = info.streams?.find((s: any) => s.codec_type === 'video');
    const as = info.streams?.find((s: any) => s.codec_type === 'audio');
    return {
      vcodec: vs?.codec_name ?? '',
      acodec: as?.codec_name ?? '',
      hasMoov: info.format?.format_name?.includes('mp4') ?? false,
    };
  } catch {
    return null;
  }
}

/** Get duration in seconds from ffprobe output (for Material.durationSec). */
async function getDuration(filePath: string): Promise<number | null> {
  const ffprobe = process.env.FFPROBE_PATH ?? 'ffprobe';
  const { code, stdout } = await run(ffprobe, [
    '-v', 'quiet', '-print_format', 'json', '-show_format', filePath,
  ]);
  if (code !== 0) return null;
  try {
    const info = JSON.parse(stdout);
    const dur = parseFloat(info.format?.duration);
    return isNaN(dur) ? null : Math.round(dur);
  } catch {
    return null;
  }
}

export interface TranscodePayload {
  materialId: string;
  organizationId: string;
  /** The current storage key of the raw upload. */
  fileKey: string;
}

export async function processVideoTranscode(payload: TranscodePayload): Promise<void> {
  const { materialId, organizationId, fileKey } = payload;
  const storage = getStorage();

  // 1. Create temp directory
  const tmpDir = path.join(os.tmpdir(), `qs-transcode-${crypto.randomUUID().slice(0, 8)}`);
  await fs.mkdir(tmpDir, { recursive: true });

  const ext = path.extname(fileKey).slice(1).toLowerCase();
  const inputFile = path.join(tmpDir, `input.${ext}`);
  const outputFile = path.join(tmpDir, 'output.mp4');

  try {
    // 2. Download original file from storage
    console.log(`[transcode] Downloading ${fileKey}...`);
    const data = await storage.get(fileKey);
    await fs.writeFile(inputFile, data);

    // 3. Probe the file to decide the conversion strategy
    const info = await probe(inputFile);
    const isAlreadyH264 = info?.vcodec === 'h264' && (info?.acodec === 'aac' || info?.acodec === '');

    let ffmpegArgs: string[];
    if (isAlreadyH264 && MP4_EXTS.has(ext)) {
      // Already H.264 MP4 — just remux for faststart (moov atom at front)
      console.log(`[transcode] ${fileKey} is already H.264 MP4 — remuxing for faststart`);
      ffmpegArgs = [
        '-i', inputFile,
        '-c', 'copy',           // no re-encode — just copy streams
        '-movflags', '+faststart',
        '-y', outputFile,
      ];
    } else if (isAlreadyH264) {
      // H.264 video in a different container (MOV, MKV) — copy video, remux to MP4
      console.log(`[transcode] ${fileKey} is H.264 in ${ext} container — remuxing to MP4`);
      ffmpegArgs = [
        '-i', inputFile,
        '-c:v', 'copy',         // keep video as-is
        '-c:a', 'aac',          // ensure audio is AAC
        '-b:a', '128k',
        '-movflags', '+faststart',
        '-y', outputFile,
      ];
    } else {
      // Full transcode — convert everything to H.264 + AAC
      console.log(`[transcode] ${fileKey} needs full transcode (${info?.vcodec ?? 'unknown'} → H.264)`);
      ffmpegArgs = [
        '-i', inputFile,
        '-c:v', 'libx264',
        '-preset', 'medium',    // good balance of speed vs quality
        '-crf', '23',           // visually lossless for most content
        '-c:a', 'aac',
        '-b:a', '128k',
        '-movflags', '+faststart',
        '-y', outputFile,
      ];
    }

    // 4. Run FFmpeg
    console.log(`[transcode] Running FFmpeg...`);
    const result = await run(ffmpegPath(), ffmpegArgs);
    if (result.code !== 0) {
      throw new Error(`FFmpeg failed (exit ${result.code}): ${result.stderr.slice(-500)}`);
    }

    // 5. Read converted file and determine new key
    const converted = await fs.readFile(outputFile);
    const stat = await fs.stat(outputFile);
    const durationSec = await getDuration(outputFile);

    // New key: same path but with .mp4 extension
    const newKey = fileKey.replace(/\.[^.]+$/, '.mp4');
    const keyChanged = newKey !== fileKey;

    // 6. Upload converted file to storage
    console.log(`[transcode] Uploading converted file as ${newKey} (${(stat.size / 1024 / 1024).toFixed(1)} MB)...`);
    await storage.put(newKey, converted, 'video/mp4');

    // 7. Update the Material row in MySQL
    await prisma.material.update({
      where: { id: materialId },
      data: {
        fileKey: newKey,
        sizeBytes: BigInt(stat.size),
        ...(durationSec !== null ? { durationSec } : {}),
        status: 'published',
      },
    });
    console.log(`[transcode] Material ${materialId} updated → published`);

    // 8. Clean up old file from storage if key changed
    if (keyChanged) {
      try { await storage.delete(fileKey); } catch { /* non-critical */ }
    }

  } finally {
    // 9. Clean up temp directory
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

// ─── Recording transcode (class recordings: WebM → MP4) ────────────

export interface RecordingTranscodePayload {
  recordingId: string;
  organizationId: string;
  fileKey: string;
  /** Status to set after transcoding: 'published' or 'pending_approval'. */
  finalStatus: string;
}

export async function processRecordingTranscode(payload: RecordingTranscodePayload): Promise<void> {
  const { recordingId, fileKey, finalStatus } = payload;
  const storage = getStorage();

  const tmpDir = path.join(os.tmpdir(), `qs-rec-transcode-${crypto.randomUUID().slice(0, 8)}`);
  await fs.mkdir(tmpDir, { recursive: true });

  const ext = path.extname(fileKey).slice(1).toLowerCase();
  const inputFile = path.join(tmpDir, `input.${ext}`);
  const outputFile = path.join(tmpDir, 'output.mp4');

  try {
    console.log(`[transcode-rec] Downloading ${fileKey}...`);
    const data = await storage.get(fileKey);
    await fs.writeFile(inputFile, data);

    const info = await probe(inputFile);
    const isAlreadyH264 = info?.vcodec === 'h264' && (info?.acodec === 'aac' || info?.acodec === '');

    let ffmpegArgs: string[];
    if (isAlreadyH264 && MP4_EXTS.has(ext)) {
      ffmpegArgs = ['-i', inputFile, '-c', 'copy', '-movflags', '+faststart', '-y', outputFile];
    } else if (isAlreadyH264) {
      ffmpegArgs = ['-i', inputFile, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', '-y', outputFile];
    } else {
      console.log(`[transcode-rec] Full transcode (${info?.vcodec ?? ext} → H.264)`);
      ffmpegArgs = ['-i', inputFile, '-c:v', 'libx264', '-preset', 'medium', '-crf', '23', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', '-y', outputFile];
    }

    console.log(`[transcode-rec] Running FFmpeg...`);
    const result = await run(ffmpegPath(), ffmpegArgs);
    if (result.code !== 0) {
      throw new Error(`FFmpeg failed (exit ${result.code}): ${result.stderr.slice(-500)}`);
    }

    const converted = await fs.readFile(outputFile);
    const stat = await fs.stat(outputFile);
    const newKey = fileKey.replace(/\.[^.]+$/, '.mp4');
    const keyChanged = newKey !== fileKey;

    console.log(`[transcode-rec] Uploading ${newKey} (${(stat.size / 1024 / 1024).toFixed(1)} MB)...`);
    await storage.put(newKey, converted, 'video/mp4');

    await prisma.recording.update({
      where: { id: recordingId },
      data: {
        fileKey: newKey,
        sizeBytes: BigInt(stat.size),
        status: finalStatus,
      },
    });
    console.log(`[transcode-rec] Recording ${recordingId} → ${finalStatus}`);

    if (keyChanged) {
      try { await storage.delete(fileKey); } catch { /* non-critical */ }
    }
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

