'use client';
/**
 * 🔴 Class recorder — records the instructor's screen + computer sound (students' voices from
 * Meet/Zoom) + microphone, right from the browser. No software to install.
 *
 * How it stays safe for 1–3 hour classes:
 *  - the video is cut into 5-second pieces; every piece is saved on this computer (IndexedDB) AND
 *    uploaded to the LMS while the class is still running — at the end only a few seconds remain;
 *  - no internet for a while → pieces wait on the computer and go up when it's back;
 *  - tab closed / browser crashed → next time the panel opens it offers to save what was recorded;
 *  - the server writes the real length into the file at the end, so students can jump around in it.
 * The finished file becomes a normal class recording (Admin approval unless "Publish recordings directly").
 *
 * Mounted once per panel (admin + instructor layouts), so it keeps recording while you move between pages.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/client/api';
import { addDurationPlaceholder } from '@/lib/client/webmDuration';

export interface RecordTarget { batchId: string; sessionId?: string; title: string }

type Phase = 'idle' | 'ready' | 'starting' | 'recording' | 'paused' | 'saving' | 'done' | 'error';

interface Meta {
  id: string;
  batchId: string;
  sessionId?: string;
  title: string;
  key: string;
  url: string;
  activeMs: number;          // recorded time without pauses
  durationOffset: number | null;
  sent: number;              // bytes the server has confirmed
  nextSeq: number;
  updatedAt: number;         // heartbeat — another open tab must not "recover" a running recording
}
interface Piece { seq: number; blob: Blob }

const PIECE_MS = 5000;
const UPLOAD_BATCH = 4 * 1024 * 1024;          // stays under common proxy limits
const MAX_BYTES = 4 * 1024 * 1024 * 1024;      // server limit for recordings (4 GB ≈ 6–7 h at this quality)
const STALE_MS = 45_000;

// ───────────────────────── IndexedDB (pieces kept until the server has them) ─────────────────────────
const DB = 'qs-class-recorder';
function idb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => {
        r.result.createObjectStore('meta', { keyPath: 'id' });
        r.result.createObjectStore('pieces', { keyPath: ['recId', 'seq'] });
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
}
function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return idb().then((db) => new Promise<T | undefined>((resolve) => {
    if (!db) return resolve(undefined);
    try {
      const t = db.transaction(store, mode);
      const req = fn(t.objectStore(store));
      t.oncomplete = () => { resolve(req ? (req.result as T) : undefined); db.close(); };
      t.onerror = t.onabort = () => { resolve(undefined); db.close(); };
    } catch { resolve(undefined); db.close(); }
  }));
}
const saveMeta = (m: Meta) => tx('meta', 'readwrite', (s) => { s.put({ ...m }); });
const allMeta = () => tx<Meta[]>('meta', 'readonly', (s) => s.getAll()).then((x) => x ?? []);
const savePiece = (recId: string, p: Piece) => tx('pieces', 'readwrite', (s) => { s.put({ recId, seq: p.seq, blob: p.blob }); });
const loadPieces = (recId: string) =>
  tx<{ seq: number; blob: Blob }[]>('pieces', 'readonly', (s) => s.getAll(IDBKeyRange.bound([recId, 0], [recId, Number.MAX_SAFE_INTEGER])))
    .then((x) => (x ?? []).map((r) => ({ seq: r.seq, blob: r.blob })));
const dropPieces = (recId: string, uptoSeq: number) =>
  tx('pieces', 'readwrite', (s) => { s.delete(IDBKeyRange.bound([recId, 0], [recId, uptoSeq])); });
const dropRecording = async (recId: string) => {
  await dropPieces(recId, Number.MAX_SAFE_INTEGER);
  await tx('meta', 'readwrite', (s) => { s.delete(recId); });
};

// ───────────────────────── helpers ─────────────────────────
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const hhmmss = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((n) => String(n).padStart(2, '0')).join(':');
};
const mb = (n: number) => `${(n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
const pickMime = () =>
  ['video/webm;codecs=vp8,opus', 'video/webm;codecs=vp9,opus', 'video/webm'].find((t) => MediaRecorder.isTypeSupported(t)) ?? '';

class UploadExpired extends Error {}

/** PUT one range; returns how many bytes the server now holds. */
async function putRange(url: string, body: Blob, start: number): Promise<number> {
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Range': `bytes ${start}-${start + body.size - 1}/*` },
    body,
  });
  const data = await res.json().catch(() => ({}));
  if (res.ok) return Number(data.received ?? start + body.size);
  if (res.status === 401) throw new UploadExpired('upload link expired');
  if (typeof data.received === 'number') return data.received; // 409/400 → server tells the real offset
  throw new Error(data.error ?? `Upload failed (${res.status})`);
}

// ───────────────────────── context ─────────────────────────
interface Ctx { phase: Phase; open: (t: RecordTarget) => void; recordingSessionId?: string }
const RecorderContext = createContext<Ctx>({ phase: 'idle', open: () => {} });
export const useClassRecorder = () => useContext(RecorderContext);

export default function ClassRecorderProvider({ children }: { children: React.ReactNode }) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [target, setTarget] = useState<RecordTarget | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [sent, setSent] = useState(0);
  const [waiting, setWaiting] = useState(0);         // bytes recorded but not on the server yet
  const [offline, setOffline] = useState(false);
  const [warn, setWarn] = useState<string[]>([]);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [orphans, setOrphans] = useState<Meta[]>([]);

  const meta = useRef<Meta | null>(null);
  const queue = useRef<Piece[]>([]);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const recorder = useRef<MediaRecorder | null>(null);
  const tracks = useRef<MediaStreamTrack[]>([]);
  const audioCtx = useRef<AudioContext | null>(null);
  const segStart = useRef<number | null>(null);    // when the current (unpaused) stretch began
  const doneMs = useRef(0);                        // recorded time before the current stretch
  const stopped = useRef<Promise<void> | null>(null);

  const activeMs = () => doneMs.current + (segStart.current ? Date.now() - segStart.current : 0);
  const refreshWaiting = () => setWaiting(queue.current.reduce((n, p) => n + p.blob.size, 0));

  // ── uploader: ONE loop sends waiting pieces in order; offline → keeps retrying (pieces are safe in IndexedDB) ──
  const pumping = useRef<Promise<void> | null>(null);
  const pump = useCallback((): Promise<void> => {
    if (pumping.current) return pumping.current;
    pumping.current = (async () => {
      let failures = 0;
      while (queue.current.length && meta.current) {
        const m = meta.current;
        const batch: Piece[] = [];
        let size = 0;
        while (queue.current.length && (batch.length === 0 || size + queue.current[0].blob.size <= UPLOAD_BATCH)) {
          const p = queue.current.shift()!;
          batch.push(p); size += p.blob.size;
        }
        const body = new Blob(batch.map((p) => p.blob));
        let received: number;
        try {
          received = await putRange(m.url, body, m.sent);
        } catch (e) {
          queue.current.unshift(...batch);
          if (e instanceof UploadExpired) throw e;
          setOffline(true);
          refreshWaiting();
          await sleep(Math.min(30_000, 1000 * 2 ** Math.min(++failures, 5)));
          continue;
        }
        if (received === m.sent) { // nothing stored (connection broke) → send the same pieces again
          queue.current.unshift(...batch);
          await sleep(Math.min(30_000, 1000 * 2 ** Math.min(++failures, 5)));
          continue;
        }
        if (received !== m.sent + body.size) {
          queue.current.unshift(...batch);
          throw new Error(`Upload out of step (server has ${received} bytes, expected ${m.sent + body.size})`);
        }
        m.sent = received;
        m.updatedAt = Date.now();
        await dropPieces(m.id, batch[batch.length - 1].seq);
        await saveMeta(m);
        failures = 0;
        setSent(m.sent); setOffline(false); refreshWaiting();
      }
    })().finally(() => { pumping.current = null; });
    return pumping.current;
  }, []);
  const stopRef = useRef<() => Promise<void> | void>(() => {});

  // pieces arrive every 5 s — strictly one after the other (the first one gets the Duration placeholder)
  const onPiece = useCallback((blob: Blob) => {
    chain.current = chain.current.then(async () => {
      const m = meta.current;
      if (!m || blob.size === 0) return;
      let data = blob;
      if (m.nextSeq === 0) {
        const fixed = addDurationPlaceholder(new Uint8Array(await blob.arrayBuffer()));
        if (fixed) { data = new Blob([fixed.bytes as BlobPart], { type: blob.type }); m.durationOffset = fixed.durationOffset; }
      }
      const piece = { seq: m.nextSeq++, blob: data };
      m.activeMs = activeMs();
      m.updatedAt = Date.now();
      await savePiece(m.id, piece);
      await saveMeta(m);
      queue.current.push(piece);
      refreshWaiting();
      if (m.sent + queue.current.reduce((n, p) => n + p.blob.size, 0) > MAX_BYTES - 50 * 1024 * 1024) {
        setWarn((w) => [...w, 'The recording reached the 4 GB limit — it was stopped and saved.']);
        void stopRef.current();
      }
      pump().catch((e) => setWarn((w) => [...w, `Upload problem: ${e?.message ?? e}. Recording continues and is kept on this computer.`]));
    });
  }, [pump]);

  const releaseDevices = () => {
    tracks.current.forEach((t) => t.stop());
    tracks.current = [];
    audioCtx.current?.close().catch(() => {});
    audioCtx.current = null;
  };

  /** Send what's left, close the file, register it as a class recording. */
  const finish = useCallback(async (m: Meta) => {
    setPhase('saving'); setErr('');
    try {
      while (queue.current.length) await pump(); // offline → keeps trying (pieces are safe on this computer)
      await pumping.current;
      if (m.sent === 0) {
        await dropRecording(m.id);
        meta.current = null;
        setMsg('Nothing was recorded.'); setPhase('done');
        return;
      }
      const fin = await fetch(m.url, { method: 'PUT', headers: { 'Content-Range': `bytes */${m.sent}` } });
      if (fin.status === 401) throw new UploadExpired('expired');
      if (!fin.ok) throw new Error((await fin.json().catch(() => ({}))).error ?? 'Could not finish the upload');
      const d = await api('/api/recordings', {
        method: 'POST',
        json: {
          batchId: m.batchId, sessionId: m.sessionId, title: m.title, fileKey: m.key, sizeBytes: m.sent,
          ...(m.durationOffset ? { durationMs: Math.max(1000, m.activeMs), durationOffset: m.durationOffset } : {}),
        },
      });
      await dropRecording(m.id);
      meta.current = null;
      setMsg(d.recording?.status === 'published'
        ? `✓ “${m.title}” saved (${hhmmss(m.activeMs)}, ${mb(m.sent)}) — students can watch it under Recordings.`
        : `✓ “${m.title}” saved (${hhmmss(m.activeMs)}, ${mb(m.sent)}) — it appears for students after an admin approves it.`);
      setPhase('done');
    } catch (e: any) {
      setErr(e instanceof UploadExpired
        ? 'This recording is more than 24 hours old and can no longer be saved.'
        : `${e?.message ?? e}. Everything recorded is kept on this computer — press “Try again”.`);
      setPhase('error');
    }
  }, [pump]);

  const stop = useCallback(async () => {
    const r = recorder.current;
    if (!r || stopped.current) return stopped.current ?? undefined;
    stopped.current = (async () => {
      if (segStart.current) { doneMs.current += Date.now() - segStart.current; segStart.current = null; }
      if (r.state !== 'inactive') {
        const ended = new Promise<void>((ok) => r.addEventListener('stop', () => ok(), { once: true }));
        r.stop();
        await ended;
      }
      await chain.current; // last piece stored + queued
      releaseDevices();
      recorder.current = null;
      if (meta.current) { meta.current.activeMs = doneMs.current; await saveMeta(meta.current); await finish(meta.current); }
    })();
    try { await stopped.current; } finally { stopped.current = null; }
  }, [finish]);
  stopRef.current = stop;

  /** Must run inside the click on "Start recording" — browsers only show the screen picker after a click. */
  const start = useCallback(async () => {
    if (!target) return;
    setErr(''); setWarn([]); setMsg('');
    if (!navigator.mediaDevices?.getDisplayMedia || typeof MediaRecorder === 'undefined') {
      setErr('Recording needs Chrome or Edge on a laptop/desktop computer.'); setPhase('error'); return;
    }
    // created before the first await, while the click still counts — otherwise the sound would be silent
    const ac = new AudioContext();
    audioCtx.current = ac;
    setPhase('starting');
    let screen: MediaStream;
    try {
      screen = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 15, max: 15 }, width: { max: 1920 }, height: { max: 1080 } },
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        // Chrome/Edge hints (ignored elsewhere): offer system sound, don't offer this LMS tab itself
        systemAudio: 'include', selfBrowserSurface: 'exclude', surfaceSwitching: 'include', monitorTypeSurfaces: 'include',
      } as DisplayMediaStreamOptions);
    } catch {
      releaseDevices(); setPhase('ready'); return; // picker closed — nothing happened
    }
    const notes: string[] = [];
    let mic: MediaStream | null = null;
    try {
      mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch {
      notes.push('Microphone not allowed — your voice is not recorded. Allow the microphone in the address bar, then record again.');
    }
    const video = screen.getVideoTracks()[0];
    const sys = screen.getAudioTracks();
    if (!sys.length) notes.push('No computer sound is being recorded, so students’ voices from Meet/Zoom will be missing. Next time pick “Entire screen” (or the meeting tab) and switch on “Also share system audio”.');
    if ((video.getSettings() as any).displaySurface === 'window')
      notes.push('You are sharing one window — anything you open outside it won’t be recorded.');

    tracks.current = [...screen.getTracks(), ...(mic?.getTracks() ?? [])];
    const out = new MediaStream([video]);
    const audioIn = [...sys, ...(mic?.getAudioTracks() ?? [])];
    if (audioIn.length) {
      await ac.resume().catch(() => {});
      const dest = ac.createMediaStreamDestination();
      for (const t of audioIn) ac.createMediaStreamSource(new MediaStream([t])).connect(dest);
      out.addTrack(dest.stream.getAudioTracks()[0]);
    }

    let upload: { url: string; key: string };
    try {
      ({ upload } = await api('/api/uploads/presign', {
        method: 'POST',
        json: { fileName: 'class-recording.webm', contentType: 'video/webm', sizeBytes: MAX_BYTES, purpose: 'recording', live: true },
      }));
    } catch (e: any) {
      releaseDevices(); setErr(`Could not start: ${e.message}`); setPhase('error'); return;
    }

    const m: Meta = {
      id: crypto.randomUUID(), batchId: target.batchId, sessionId: target.sessionId, title: target.title,
      key: upload.key, url: upload.url, activeMs: 0, durationOffset: null, sent: 0, nextSeq: 0, updatedAt: Date.now(),
    };
    meta.current = m;
    queue.current = [];
    await saveMeta(m);

    const r = new MediaRecorder(out, { mimeType: pickMime() || undefined, videoBitsPerSecond: 1_200_000, audioBitsPerSecond: 96_000 });
    r.ondataavailable = (e) => onPiece(e.data);
    r.onerror = () => { setWarn((w) => [...w, 'The browser stopped the recording unexpectedly — what was recorded is being saved.']); void stop(); };
    video.addEventListener('ended', () => { void stop(); }); // "Stop sharing" in the browser bar
    recorder.current = r;
    doneMs.current = 0; segStart.current = Date.now();
    setSent(0); setWaiting(0); setElapsed(0); setWarn(notes);
    r.start(PIECE_MS);
    setPhase('recording');
  }, [target, onPiece, stop]);

  const pause = () => {
    const r = recorder.current;
    if (!r || r.state !== 'recording') return;
    r.pause();
    if (segStart.current) { doneMs.current += Date.now() - segStart.current; segStart.current = null; }
    setPhase('paused');
  };
  const resume = () => {
    const r = recorder.current;
    if (!r || r.state !== 'paused') return;
    r.resume(); segStart.current = Date.now(); setPhase('recording');
  };

  // clock + heartbeat
  useEffect(() => {
    if (phase !== 'recording' && phase !== 'paused') return;
    const t = setInterval(() => {
      setElapsed(activeMs());
      if (meta.current) { meta.current.updatedAt = Date.now(); meta.current.activeMs = activeMs(); void saveMeta(meta.current); }
    }, 1000);
    return () => clearInterval(t);
  }, [phase]);

  // closing the tab while recording/saving → browser asks "Leave site?"
  useEffect(() => {
    if (!['starting', 'recording', 'paused', 'saving'].includes(phase)) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [phase]);

  // recordings interrupted earlier (tab closed, crash, power cut) → offer to save them
  useEffect(() => {
    let alive = true;
    const check = async () => {
      if (typeof indexedDB === 'undefined') return;
      const list = (await allMeta()).filter((x) => x.id !== meta.current?.id && Date.now() - x.updatedAt > STALE_MS);
      if (alive) setOrphans(list);
    };
    void check();
    const t = setInterval(check, 15_000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const recover = async (m: Meta) => {
    if (meta.current) return;
    setOrphans((o) => o.filter((x) => x.id !== m.id));
    setTarget({ batchId: m.batchId, sessionId: m.sessionId, title: m.title });
    setErr(''); setMsg(''); setWarn([]);
    meta.current = m;
    try {
      const st = await fetch(m.url).then(async (r) => {
        if (r.status === 401) throw new UploadExpired('expired');
        return r.json();
      });
      let pieces = (await loadPieces(m.id)).sort((a, b) => a.seq - b.seq);
      if (st.done) pieces = [];
      else {
        // the server may already hold part of the first waiting piece (response lost) → skip those bytes
        let skip = Number(st.received ?? 0) - m.sent;
        if (skip < 0) throw new Error('Some of this recording is missing on the server');
        while (skip > 0 && pieces.length) {
          const p = pieces[0];
          if (p.blob.size <= skip) { skip -= p.blob.size; pieces.shift(); } else { pieces[0] = { seq: p.seq, blob: p.blob.slice(skip) }; skip = 0; }
        }
        m.sent = Number(st.received ?? 0);
      }
      queue.current = pieces;
      setSent(m.sent); refreshWaiting();
      await finish(m);
    } catch (e: any) {
      meta.current = null;
      setErr(e instanceof UploadExpired ? 'This recording is more than 24 hours old and can no longer be saved — you can delete it.' : e.message);
      setOrphans((o) => [...o, m]);
      setPhase('error');
    }
  };
  const discard = async (m: Meta) => {
    if (!confirm(`Delete the unsaved recording “${m.title}” from this computer?`)) return;
    await dropRecording(m.id);
    setOrphans((o) => o.filter((x) => x.id !== m.id));
  };

  const open = useCallback((t: RecordTarget) => {
    if (['starting', 'recording', 'paused', 'saving'].includes(phase)) {
      setWarn((w) => (w.includes('Only one class can be recorded at a time.') ? w : [...w, 'Only one class can be recorded at a time.']));
      return;
    }
    setTarget(t); setErr(''); setMsg(''); setWarn([]); setPhase('ready');
  }, [phase]);

  const close = () => {
    // an unsaved recording stays on this computer and shows up again under "Unsaved recording"
    if (phase === 'error' && meta.current) { meta.current.updatedAt = 0; void saveMeta(meta.current); meta.current = null; }
    setPhase('idle'); setTarget(null); setErr(''); setMsg(''); setWarn([]);
  };
  const retry = () => { if (meta.current) void finish(meta.current); };

  const live = phase === 'recording' || phase === 'paused';
  const showOrphans = orphans.length > 0 && !live && phase !== 'saving' && phase !== 'starting';

  return (
    <RecorderContext.Provider value={{ phase, open, recordingSessionId: live || phase === 'saving' ? target?.sessionId : undefined }}>
      {children}
      {(phase !== 'idle' || showOrphans) && (
        <div className="recorder" role="region" aria-label="Class recorder">
          {phase === 'ready' && target && (<>
            <div className="recorder-head"><b>🔴 Record this class</b><button className="iconbtn" onClick={close} title="Close">✕</button></div>
            <div className="recorder-title">{target.title}</div>
            <ol className="recorder-steps">
              <li>Join the meeting (Meet / Zoom) first.</li>
              <li>Press <b>Start recording</b>. In the box that opens choose <b>Entire screen</b> and switch on <b>Also share system audio</b> — that records the students’ voices too.</li>
              <li>Use headphones so your speakers don’t echo into the microphone.</li>
            </ol>
            <button className="btn" style={{ width: '100%', justifyContent: 'center' }} onClick={start}>● Start recording</button>
          </>)}

          {phase === 'starting' && <div className="recorder-head"><b>Choose what to share…</b></div>}

          {live && target && (<>
            <div className="recorder-head">
              <b className={phase === 'recording' ? 'rec-dot' : ''} style={{ whiteSpace: 'nowrap' }}>{phase === 'recording' ? 'REC' : 'Paused'} {hhmmss(elapsed)}</b>
              <span className="muted" style={{ fontSize: '.75rem', whiteSpace: 'nowrap' }}>{mb(sent)} uploaded</span>
            </div>
            <div className="recorder-title">{target.title}</div>
            {offline && <div className="recorder-offline">⚠ No internet — the recording continues and is kept on this computer. It uploads by itself when the internet is back.</div>}
            {waiting > 2 * UPLOAD_BATCH && <div className="muted" style={{ fontSize: '.75rem' }}>{mb(waiting)} waiting to upload</div>}
            <div className="actions" style={{ marginTop: 8 }}>
              {phase === 'recording'
                ? <button className="btn btn-ghost btn-sm" onClick={pause}>Pause</button>
                : <button className="btn btn-ghost btn-sm" onClick={resume}>▶ Resume</button>}
              <button className="btn btn-sm btn-stop" onClick={() => void stop()}>■ Stop &amp; save</button>
            </div>
          </>)}

          {phase === 'saving' && (<>
            <div className="recorder-head"><b>Saving the recording…</b></div>
            <div className="muted" style={{ fontSize: '.8rem' }}>
              {waiting > 0 ? `${mb(waiting)} left to upload` : 'Finishing'}{offline ? ' — waiting for the internet (nothing is lost)' : ''}. Keep this tab open.
            </div>
          </>)}

          {phase === 'done' && (<>
            <div className="recorder-head"><b>Recording</b><button className="iconbtn" onClick={close} title="Close">✕</button></div>
            <div className="ok" style={{ margin: 0 }}>{msg}</div>
          </>)}

          {phase === 'error' && (<>
            <div className="recorder-head"><b>Recording</b><button className="iconbtn" onClick={close} title="Close">✕</button></div>
            <div className="err" style={{ margin: 0 }}>{err}</div>
            {meta.current && <button className="btn btn-sm" style={{ marginTop: 8 }} onClick={retry}>Try again</button>}
          </>)}

          {warn.length > 0 && phase !== 'idle' && (
            <ul className="recorder-warn">{warn.map((w, i) => <li key={i}>{w}</li>)}</ul>
          )}

          {showOrphans && orphans.map((m) => (
            <div key={m.id} className="recorder-orphan">
              <b>Unsaved recording:</b> “{m.title}” ({hhmmss(m.activeMs)}) was interrupted.
              <div className="actions" style={{ marginTop: 6 }}>
                <button className="btn btn-sm" onClick={() => void recover(m)}>Save it</button>
                <button className="btn btn-ghost btn-sm" onClick={() => void discard(m)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </RecorderContext.Provider>
  );
}
