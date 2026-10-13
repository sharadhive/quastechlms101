/**
 * Browser recordings (MediaRecorder WebM) carry no length, so video players can't seek in them.
 * While recording, the class recorder passes the FIRST piece of the file through
 * addDurationPlaceholder(): it inserts an empty 8-byte "Duration" field into the file header and
 * returns where it is. When the class ends, the server writes the real length there
 * (src/lib/utils/webm.ts) — the video then shows its full length and can be scrubbed.
 *
 * Returns null when the header isn't what we expect; the recording still works, just without seeking.
 */
const ID = { EBML: '1a45dfa3', SEGMENT: '18538067', INFO: '1549a966', DURATION: '4489' };

function idLength(b: Uint8Array, i: number) {
  const f = b[i];
  if (f & 0x80) return 1;
  if (f & 0x40) return 2;
  if (f & 0x20) return 3;
  if (f & 0x10) return 4;
  return 0;
}

function readSize(b: Uint8Array, i: number) {
  const f = b[i];
  let len = 1;
  let mask = 0x80;
  while (len <= 8 && !(f & mask)) { len++; mask >>= 1; }
  if (len > 8 || i + len > b.length) return null;
  let v = f & (mask - 1);
  for (let k = 1; k < len; k++) v = v * 256 + b[i + k];
  return { value: v, len, unknown: v === 2 ** (7 * len) - 1 };
}

function encodeSize(v: number, len: number) {
  const out = new Uint8Array(len);
  for (let k = len - 1; k >= 0; k--) { out[k] = v % 256; v = Math.floor(v / 256); }
  out[0] |= 1 << (8 - len);
  return out;
}

const hex = (b: Uint8Array, i: number, n: number) =>
  Array.from(b.subarray(i, i + n), (x) => x.toString(16).padStart(2, '0')).join('');

function element(b: Uint8Array, at: number) {
  if (at >= b.length) return null;
  const il = idLength(b, at);
  if (!il) return null;
  const s = readSize(b, at + il);
  if (!s) return null;
  return { id: hex(b, at, il), idLen: il, sizeLen: s.len, size: s.value, unknown: s.unknown, data: at + il + s.len };
}

export function addDurationPlaceholder(b: Uint8Array): { bytes: Uint8Array; durationOffset: number } | null {
  const ebml = element(b, 0);
  if (!ebml || ebml.id !== ID.EBML || ebml.unknown) return null;
  const seg = element(b, ebml.data + ebml.size);
  if (!seg || seg.id !== ID.SEGMENT) return null;

  let p = seg.data;
  for (let guard = 0; guard < 64 && p < b.length; guard++) {
    const c = element(b, p);
    if (!c) return null;
    if (c.id === ID.INFO) {
      const end = c.data + c.size;
      if (c.unknown || end > b.length) return null;
      // already has a Duration (another recorder) → reuse it if it is an 8-byte float
      for (let q = c.data; q < end;) {
        const d = element(b, q);
        if (!d) return null;
        if (d.id === ID.DURATION) return d.size === 8 ? { bytes: b, durationOffset: d.data } : null;
        q = d.data + d.size;
      }
      const newSize = c.size + 11; // Duration element: ID (2) + size (1) + float64 (8)
      if (newSize >= 2 ** (7 * c.sizeLen) - 1) return null;
      const out = new Uint8Array(b.length + 11);
      out.set(b.subarray(0, p + c.idLen), 0);
      out.set(encodeSize(newSize, c.sizeLen), p + c.idLen);
      out.set(b.subarray(c.data, end), c.data);
      out.set([0x44, 0x89, 0x88, 0, 0, 0, 0, 0, 0, 0, 0], end);
      out.set(b.subarray(end), end + 11);
      return { bytes: out, durationOffset: end + 3 };
    }
    if (c.unknown) return null; // reached the media data without finding Info
    p = c.data + c.size;
  }
  return null;
}
