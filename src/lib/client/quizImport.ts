/**
 * Bulk quiz import from Excel (.xlsx) or CSV — runs entirely in the browser, no extra packages.
 *
 * Accepted layouts (header names are matched loosely: "Option A", "option_a", "OPTION-A" all work):
 *   • Two sheets  — "Quiz Settings" (header row + 1 value row) and "Questions" (header row + 1 row per question)
 *   • One sheet / CSV — settings header + value row on top, then the questions header row and the questions
 *   • Questions only — settings are optional; anything missing keeps what is already in the quiz builder
 *
 * Settings columns : quiz_title | time_limit_min | attempts_allowed | show_answers
 * Question columns : question_no | question_text | option_a … option_f | correct_answer | marks | negative_marks
 *
 * The result is the quiz builder's own editor state (QQ), so the normal toQuizSchema() validation and the
 * existing API (/api/sections/[id]/materials) are reused unchanged.
 */
import type { QQ } from '@/components/QuizBuilder';

export const QUIZ_IMPORT_ACCEPT =
  '.xlsx,.csv,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const MAX_BYTES = 5 * 1024 * 1024; // a 1,000-question sheet is ~200 KB
const LETTERS = ['a', 'b', 'c', 'd', 'e', 'f'] as const;
const MAX_COLS = 64;

export interface QuizImportSettings {
  title?: string;
  timeLimitMin?: number; // 0 = no time limit (same meaning as the builder's field)
  attemptsAllowed?: number;
  showAnswers?: boolean;
}
export interface QuizImportResult {
  settings: QuizImportSettings;
  questions: QQ[];
  /** Any error = nothing should be imported (all-or-nothing, so a half-imported quiz never gets saved). */
  errors: string[];
  warnings: string[];
}

interface Row { n: number; cells: string[] } // n = row number as shown in Excel (1-based)
interface Sheet { name: string; rows: Row[] }

// ───────────────────────────── entry points ─────────────────────────────

/** Read an uploaded .xlsx / .csv file and turn it into quiz questions + settings. */
export async function readQuizFile(file: File): Promise<QuizImportResult> {
  if (file.size > MAX_BYTES) throw new Error('This file is larger than 5 MB. A quiz sheet is normally well under 1 MB — remove images or extra sheets and try again.');
  if (file.size === 0) throw new Error('This file is empty.');
  return parseQuizBytes(file.name, new Uint8Array(await file.arrayBuffer()));
}

/** Same as readQuizFile, for raw bytes (used by tests). */
export async function parseQuizBytes(fileName: string, bytes: Uint8Array): Promise<QuizImportResult> {
  const ext = (fileName.split('.').pop() ?? '').toLowerCase();
  let sheets: Sheet[];
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    // zip container → .xlsx (also catches .ods/.numbers, which readXlsx rejects with a clear message)
    sheets = await readXlsx(bytes);
  } else if ((bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) || ext === 'xls') {
    throw new Error('This is an old Excel 97-2003 (.xls) file. In Excel choose File → Save As → "Excel Workbook (*.xlsx)" and upload that file.');
  } else if (['ods', 'numbers', 'pdf', 'doc', 'docx'].includes(ext)) {
    throw new Error('Please upload an Excel (.xlsx) or CSV file.');
  } else {
    sheets = [{ name: fileName, rows: toRows(parseCsv(decodeText(bytes))) }];
  }
  return parseQuizSheets(sheets);
}

// ───────────────────────────── sheet → quiz ─────────────────────────────

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
/** xlsx cells formatted as a date/time are passed through as DATE_MARK + Excel serial number */
const DATE_MARK = '\u0001date:';
const isDateCell = (s: string) => s.startsWith(DATE_MARK);
/** Cell text as one tidy line (inputs in the builder are single-line). */
const clean = (s: string | undefined) => (s ?? '').replace(/\s*[\r\n]+\s*/g, ' ').replace(/[ \t]+/g, ' ').trim();

const SETTING_ALIASES: Record<string, string[]> = {
  quiz_title: ['quiz_title', 'title', 'quiz_name', 'name_of_quiz'],
  time_limit_min: ['time_limit_min', 'time_limit', 'time_limit_mins', 'time_limit_minutes', 'time_limit_in_minutes', 'time_limit_in_min', 'duration_min', 'duration_minutes', 'duration_in_minutes'],
  attempts_allowed: ['attempts_allowed', 'attempts', 'max_attempts', 'no_of_attempts', 'number_of_attempts', 'allowed_attempts'],
  show_answers: ['show_answers', 'show_answer', 'show_correct_answers', 'show_correct_answer', 'show_answers_after_submit'],
};
const QUESTION_ALIASES: Record<string, string[]> = {
  question_no: ['question_no', 'question_number', 'q_no', 'qno', 'no', 'sr_no', 'srno', 's_no', 'sl_no', 'serial_no'],
  question_text: ['question_text', 'question', 'questions', 'question_title'],
  correct_answer: ['correct_answer', 'correct_answers', 'correct', 'correct_option', 'correct_options', 'answer', 'answers', 'answer_key', 'right_answer', 'key'],
  marks: ['marks', 'mark', 'points', 'point', 'score', 'marks_for_correct'],
  negative_marks: ['negative_marks', 'negative_mark', 'negative', 'negative_marking', 'minus_marks', 'penalty', 'deduction'],
};
LETTERS.forEach((l, i) => {
  QUESTION_ALIASES[`option_${l}`] = [`option_${l}`, `option${l}`, `opt_${l}`, `choice_${l}`, l, `option_${i + 1}`, `option${i + 1}`, `opt_${i + 1}`, `choice_${i + 1}`];
});
const lookup = (aliases: Record<string, string[]>) => {
  const m = new Map<string, string>();
  for (const [key, list] of Object.entries(aliases)) for (const a of list) m.set(a, key);
  return m;
};
const SETTING_KEYS = lookup(SETTING_ALIASES);
const QUESTION_KEYS = lookup(QUESTION_ALIASES);

/** column index of each recognised header in a row */
function headerMap(cells: string[], keys: Map<string, string>): Record<string, number> {
  const cols: Record<string, number> = {};
  cells.forEach((c, i) => {
    const k = keys.get(norm(c ?? ''));
    if (k && cols[k] === undefined) cols[k] = i;
  });
  return cols;
}

const isBlank = (r: Row) => r.cells.every((c) => !clean(c));
const SKIP_SHEETS = new Set(['how_to_fill', 'instructions', 'instruction', 'help', 'readme', 'read_me', 'guide']);

export function parseQuizSheets(sheets: Sheet[]): QuizImportResult {
  const settings: QuizImportSettings = {};
  const questions: QQ[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];
  const seen = new Map<string, string>(); // question text → where it first appeared
  const useSheetName = sheets.length > 1;
  let foundQuestionHeader = false;

  for (const sheet of sheets) {
    if (SKIP_SHEETS.has(norm(sheet.name))) continue;
    const at = (r: Row) => (useSheetName ? `"${sheet.name}" row ${r.n}` : `Row ${r.n}`);
    let qcols: Record<string, number> | null = null;
    let scols: Record<string, number> | null = null; // settings header seen, waiting for its value row

    for (const row of sheet.rows) {
      if (isBlank(row)) continue;

      // ── header rows ──
      const q = headerMap(row.cells, QUESTION_KEYS);
      if (q.question_text !== undefined && q.option_a !== undefined && q.option_b !== undefined) {
        qcols = q; scols = null; foundQuestionHeader = true;
        continue;
      }
      const s = headerMap(row.cells, SETTING_KEYS);
      const sCount = Object.keys(s).length;
      const filled = row.cells.filter((c) => clean(c)).length;
      // inside a questions table be stricter, so an option that happens to read "title" never ends the table
      const isSettingsHeader = qcols ? sCount >= 2 && sCount === filled : sCount >= 2 || (sCount === 1 && filled === 1);
      if (isSettingsHeader) {
        scols = s; qcols = null;
        continue;
      }

      // ── value rows ──
      if (scols) {
        readSettings(row, scols, settings, errors, at(row));
        scols = null;
      } else if (qcols) {
        readQuestion(row, qcols, questions, errors, warnings, seen, at(row));
      }
      // anything else (a title line, notes above the table …) is ignored
    }
  }

  if (!foundQuestionHeader) {
    errors.unshift('Could not find the questions table. Your file needs a header row with the column names question_text, option_a, option_b, … correct_answer — download the template to see the exact layout.');
  } else if (!questions.length && !errors.length) {
    errors.push('The questions table is empty — add one question per row under the header row.');
  }
  return { settings, questions, errors, warnings };
}

function readSettings(row: Row, cols: Record<string, number>, out: QuizImportSettings, errors: string[], where: string) {
  const get = (k: string) => (cols[k] === undefined ? '' : clean(row.cells[cols[k]]));

  const title = get('quiz_title');
  if (title) out.title = title.slice(0, 200);

  const time = get('time_limit_min');
  if (isDateCell(time)) {
    // typed as 0:10 → Excel stored a time of day; convert back to minutes
    const days = Number(time.slice(DATE_MARK.length));
    if (days < 1) out.timeLimitMin = Math.round(days * 1440);
    else errors.push(`${where}: time_limit_min was turned into a date by Excel — format that cell as a Number and type the minutes, e.g. 10.`);
  } else if (time) {
    const m = /^(\d+(?:\.\d+)?)\s*(?:m|min|mins|minute|minutes)?$/i.exec(time);
    if (/^(none|no|unlimited|no limit|nil|-)$/i.test(time)) out.timeLimitMin = 0;
    else if (m) out.timeLimitMin = Number(m[1]);
    else errors.push(`${where}: time_limit_min "${time}" must be a number of minutes (0 = no time limit).`);
  }

  const attempts = get('attempts_allowed');
  if (attempts) {
    const n = Number(attempts);
    if (Number.isInteger(n) && n >= 1) out.attemptsAllowed = n;
    else errors.push(`${where}: attempts_allowed ${shown(attempts)} must be a whole number, 1 or more.`);
  }

  const show = get('show_answers');
  if (show) {
    const b = yesNo(show);
    if (b === undefined) errors.push(`${where}: show_answers ${shown(show)} must be yes or no.`);
    else out.showAnswers = b;
  }
}

const shown = (v: string) => (isDateCell(v) ? '(Excel turned it into a date)' : `"${v}"`);

function yesNo(v: string): boolean | undefined {
  const s = v.trim().toLowerCase();
  if (['yes', 'y', 'true', '1', 'show'].includes(s)) return true;
  if (['no', 'n', 'false', '0', 'hide'].includes(s)) return false;
  return undefined;
}

function readQuestion(
  row: Row, cols: Record<string, number>, out: QQ[], errors: string[], warnings: string[],
  seen: Map<string, string>, at: string,
) {
  const get = (k: string) => (cols[k] === undefined ? '' : clean(row.cells[cols[k]]));
  const text = get('question_text');
  const raw = LETTERS.map((l) => get(`option_${l}`)); // index 0..5 = A..F as typed
  const answer = get('correct_answer');
  if (!text && !raw.some(Boolean) && !answer) return; // row only has a number / default marks → skip

  const qno = isDateCell(get('question_no')) ? '' : get('question_no');
  const where = qno ? `${at} (question ${qno})` : at;
  const before = errors.length;

  // Excel silently turns entries like 1/2, 3-4 or 10:30 into dates — catch that instead of importing "45293"
  const dated = ['question_text', ...LETTERS.map((l) => `option_${l}`), 'correct_answer', 'marks', 'negative_marks'].filter((k) => isDateCell(get(k)));
  if (dated.length) {
    errors.push(`${where}: Excel changed ${dated.join(', ')} into a date (this happens to entries like 1/2, 3-4 or 10:30). Select that column → Format Cells → Text, retype the value, save and upload again.`);
    return;
  }

  if (!text) errors.push(`${where}: question_text is empty.`);
  const filled = raw.filter(Boolean).length;
  if (filled < 2) errors.push(`${where}: give at least 2 options (option_a and option_b).`);

  // correct answer letters → positions among the options as typed
  const picked: number[] = [];
  if (!answer) {
    errors.push(`${where}: correct_answer is empty — write the letter of the right option, e.g. A (or A,C for more than one).`);
  } else {
    // Only single letters are accepted. Numbers are rejected on purpose: "4" could mean option D or an
    // option whose text is 4, and guessing wrong would silently mark every student incorrectly.
    const tokens = answer.toUpperCase().replace(/[()[\].]/g, ' ').split(/[\s,;/|&+]+/)
      .filter((t) => t && !['AND', 'OPTION', 'OPT', 'OPTIONS'].includes(t));
    const bad: string[] = [];
    for (const t of tokens) {
      if (/^[A-F]$/.test(t)) picked.push(t.charCodeAt(0) - 65);
      else bad.push(t);
    }
    if (bad.length || !tokens.length)
      errors.push(`${where}: correct_answer "${answer}" is not valid — use the letters A to F, comma-separated for more than one (e.g. A,C).`);
    else
      for (const i of new Set(picked))
        if (!raw[i]) errors.push(`${where}: correct answer ${String.fromCharCode(65 + i)} points to option_${LETTERS[i]}, which is empty.`);
  }

  const marksRaw = get('marks');
  let marks = 1;
  if (marksRaw) {
    const n = Number(marksRaw);
    if (Number.isFinite(n) && n > 0) marks = n;
    else errors.push(`${where}: marks "${marksRaw}" must be a number greater than 0 (leave empty for 1).`);
  }
  const negRaw = get('negative_marks');
  let negative = 0;
  if (negRaw) {
    const n = Number(negRaw);
    if (Number.isFinite(n)) negative = Math.abs(n); // "-0.25" and "0.25" both mean deduct 0.25
    else errors.push(`${where}: negative_marks "${negRaw}" must be a number (leave empty for 0).`);
  }

  if (errors.length > before) return;

  // drop empty option columns (e.g. A, B, D filled → 3 options) and re-map the correct answers
  const keep = raw.map((o, i) => ({ o, i })).filter((z) => z.o);
  const options = keep.map((z) => z.o);
  const correct = [...new Set(picked)].map((p) => keep.findIndex((z) => z.i === p)).sort((a, b) => a - b);

  const dupKey = text.toLowerCase();
  if (seen.has(dupKey)) warnings.push(`${where}: same question as ${seen.get(dupKey)} — imported twice.`);
  else seen.set(dupKey, where);
  if (new Set(options.map((o) => o.toLowerCase())).size < options.length)
    warnings.push(`${where}: two options have the same text.`);
  if (negative > marks) warnings.push(`${where}: negative marks (${negative}) are more than the marks (${marks}).`);

  out.push({ text, options, correct, marks, negative });
}

// ───────────────────────────── CSV ─────────────────────────────

function decodeText(b: Uint8Array): string {
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder('utf-16le').decode(b); // Excel "Unicode Text"
  if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder('utf-16be').decode(b);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(b); // strips the UTF-8 BOM
  } catch {
    return new TextDecoder('windows-1252').decode(b); // plain "CSV (Comma delimited)" saved by older Excel
  }
}

function countOutsideQuotes(line: string, d: string) {
  let n = 0, q = false;
  for (const c of line) { if (c === '"') q = !q; else if (c === d && !q) n++; }
  return n;
}

/** RFC 4180 CSV → grid. Handles quotes, "" escapes, line breaks inside quotes, CRLF, `sep=;` and ; / tab delimiters. */
export function parseCsv(input: string): string[][] {
  let text = input.replace(/^﻿/, '');
  let d = '';
  const sep = /^sep=(.)[ \t]*\r?\n/i.exec(text);
  if (sep) { d = sep[1]; text = text.slice(sep[0].length); }
  if (!d) {
    const sample = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 10);
    let best = 0;
    d = ',';
    for (const cand of [',', ';', '\t']) {
      const score = sample.reduce((s, l) => s + countOutsideQuotes(l, cand), 0);
      if (score > best) { best = score; d = cand; }
    }
  }

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"' && field === '') quoted = true;
    else if (c === d) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const toRows = (grid: string[][]): Row[] => grid.map((cells, i) => ({ n: i + 1, cells }));

// ───────────────────────────── XLSX (zip + XML) reader ─────────────────────────────

const u16 = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8);
const u32 = (b: Uint8Array, o: number) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

interface ZipEntry { method: number; size: number; offset: number; flags: number }

function zipIndex(b: Uint8Array): Map<string, ZipEntry> {
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 65535); i--) {
    if (u32(b, i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('This file looks damaged — open it in Excel, save it again as .xlsx and re-upload.');
  const count = u16(b, eocd + 10);
  let p = u32(b, eocd + 16);
  const out = new Map<string, ZipEntry>();
  const dec = new TextDecoder();
  for (let i = 0; i < count && p + 46 <= b.length; i++) {
    if (u32(b, p) !== 0x02014b50) break;
    const nameLen = u16(b, p + 28);
    const name = dec.decode(b.subarray(p + 46, p + 46 + nameLen));
    out.set(name.replace(/\\/g, '/'), { flags: u16(b, p + 8), method: u16(b, p + 10), size: u32(b, p + 20), offset: u32(b, p + 42) });
    p += 46 + nameLen + u16(b, p + 30) + u16(b, p + 32);
  }
  return out;
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined')
    throw new Error('This browser cannot open .xlsx files. Please update your browser, or in Excel save the sheet as "CSV UTF-8" and upload that.');
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function zipRead(b: Uint8Array, idx: Map<string, ZipEntry>, name: string): Promise<Uint8Array | null> {
  const e = idx.get(name);
  if (!e) return null;
  if (e.flags & 1) throw new Error('This Excel file is password-protected. Remove the password (File → Info → Protect Workbook) and upload again.');
  if (u32(b, e.offset) !== 0x04034b50) throw new Error('This file looks damaged — open it in Excel, save it again as .xlsx and re-upload.');
  const start = e.offset + 30 + u16(b, e.offset + 26) + u16(b, e.offset + 28);
  const data = b.subarray(start, start + e.size);
  if (e.method === 0) return data;
  if (e.method === 8) return inflateRaw(data);
  throw new Error('This Excel file uses an unsupported compression. Open it in Excel, save again as .xlsx and re-upload.');
}

function parseXml(bytes: Uint8Array): Document {
  const doc = new DOMParser().parseFromString(new TextDecoder().decode(bytes), 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('This file looks damaged — open it in Excel, save it again as .xlsx and re-upload.');
  return doc;
}
const byTag = (root: Document | Element, tag: string) => Array.from(root.getElementsByTagNameNS('*', tag));
const childrenByTag = (el: Element, tag: string) => Array.from(el.childNodes).filter((n): n is Element => n.nodeType === 1 && (n as Element).localName === tag);

/** Visible text of a shared/inline string (<t> runs), ignoring phonetic hints (<rPh>). */
function richText(el: Element): string {
  return byTag(el, 't')
    .filter((t) => { for (let p = t.parentNode; p && p !== el; p = p.parentNode) if ((p as Element).localName === 'rPh') return false; return true; })
    .map((t) => t.textContent ?? '')
    .join('');
}

/** r:id attribute whatever its namespace prefix (transitional or strict OOXML) */
const relId = (el: Element) => Array.from(el.attributes).find((a) => a.localName === 'id' && a.name.includes(':'))?.value ?? '';

function resolvePath(baseDir: string, target: string) {
  const parts = (target.startsWith('/') ? target.slice(1) : `${baseDir}${target}`).split('/');
  const out: string[] = [];
  for (const p of parts) { if (p === '..') out.pop(); else if (p && p !== '.') out.push(p); }
  return out.join('/');
}

async function rels(b: Uint8Array, idx: Map<string, ZipEntry>, path: string) {
  const data = await zipRead(b, idx, path);
  if (!data) return [];
  return byTag(parseXml(data), 'Relationship').map((r) => ({
    id: r.getAttribute('Id') ?? '', type: r.getAttribute('Type') ?? '', target: r.getAttribute('Target') ?? '',
  }));
}

const colIndex = (ref: string) => {
  let n = 0;
  for (const ch of ref.toUpperCase()) { const c = ch.charCodeAt(0); if (c < 65 || c > 90) break; n = n * 26 + (c - 64); }
  return n - 1;
};
/** 0.30000000000000004 → "0.3", 1E-3 → "0.001" */
const numText = (v: string) => { const n = Number(v); return v.trim() && Number.isFinite(n) ? String(Number(n.toPrecision(15))) : v; };

async function readXlsx(b: Uint8Array): Promise<Sheet[]> {
  const idx = zipIndex(b);
  const rootRels = await rels(b, idx, '_rels/.rels');
  const wbPath = resolvePath('', rootRels.find((r) => r.type.endsWith('/officeDocument'))?.target ?? 'xl/workbook.xml');
  const wbData = await zipRead(b, idx, wbPath);
  if (!wbData) throw new Error('This is not an Excel .xlsx file. Please upload an Excel (.xlsx) or CSV file.');
  const wbDir = wbPath.includes('/') ? wbPath.slice(0, wbPath.lastIndexOf('/') + 1) : '';
  const wbRels = await rels(b, idx, `${wbDir}_rels/${wbPath.slice(wbDir.length)}.rels`);

  const sstPath = wbRels.find((r) => r.type.endsWith('/sharedStrings'))?.target;
  const sstData = sstPath ? await zipRead(b, idx, resolvePath(wbDir, sstPath)) : null;
  const shared = sstData ? byTag(parseXml(sstData), 'si').map(richText) : [];

  const stylesPath = wbRels.find((r) => r.type.endsWith('/styles'))?.target;
  const stylesData = stylesPath ? await zipRead(b, idx, resolvePath(wbDir, stylesPath)) : null;
  const dateStyles = stylesData ? readDateStyles(parseXml(stylesData)) : new Set<number>();

  const sheets: Sheet[] = [];
  for (const s of byTag(parseXml(wbData), 'sheet')) {
    const state = s.getAttribute('state');
    if (state === 'hidden' || state === 'veryHidden') continue;
    const rel = wbRels.find((r) => r.id === relId(s));
    if (!rel || !/worksheet$/i.test(rel.type)) continue; // skip chart sheets
    const data = await zipRead(b, idx, resolvePath(wbDir, rel.target));
    if (!data) continue;
    sheets.push({ name: s.getAttribute('name') ?? 'Sheet', rows: readSheet(parseXml(data), shared, dateStyles) });
  }
  if (!sheets.length) throw new Error('No worksheets found in this Excel file.');
  return sheets;
}

/** Built-in Excel number formats that display a date or time. */
const BUILTIN_DATE_FMTS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58]);
function isDateFormat(id: number, code: string | undefined) {
  if (code === undefined) return BUILTIN_DATE_FMTS.has(id);
  const bare = code.replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '').replace(/\\./g, '').replace(/[_*]./g, '');
  return /[dmyhs]/i.test(bare);
}
/** indexes of cellXfs styles whose number format is a date/time */
function readDateStyles(doc: Document): Set<number> {
  const custom = new Map<number, string>();
  for (const f of byTag(doc, 'numFmt')) custom.set(Number(f.getAttribute('numFmtId')), f.getAttribute('formatCode') ?? '');
  const out = new Set<number>();
  const xfs = byTag(doc, 'cellXfs')[0];
  if (xfs) childrenByTag(xfs, 'xf').forEach((xf, i) => {
    const id = Number(xf.getAttribute('numFmtId') ?? 0);
    if (isDateFormat(id, custom.get(id))) out.add(i);
  });
  return out;
}

function readSheet(doc: Document, shared: string[], dateStyles: Set<number>): Row[] {
  const rows: Row[] = [];
  let next = 1;
  for (const r of byTag(doc, 'row')) {
    const n = Number(r.getAttribute('r')) || next;
    next = n + 1;
    const cells: string[] = [];
    let col = 0;
    for (const c of childrenByTag(r, 'c')) {
      const ref = c.getAttribute('r');
      if (ref) col = colIndex(ref);
      if (col >= 0 && col < MAX_COLS) {
        const t = c.getAttribute('t');
        const v = childrenByTag(c, 'v')[0]?.textContent ?? '';
        let val: string;
        if (t === 's') val = shared[Number(v)] ?? '';
        else if (t === 'inlineStr') { const is = childrenByTag(c, 'is')[0]; val = is ? richText(is) : ''; }
        else if (t === 'b') val = v === '1' ? 'TRUE' : v === '0' ? 'FALSE' : v;
        else if (t === 'str' || t === 'e') val = v;
        else if (t === 'd' || (v && dateStyles.has(Number(c.getAttribute('s') ?? 0)))) val = DATE_MARK + v;
        else val = numText(v);
        while (cells.length < col) cells.push('');
        cells[col] = val;
      }
      col++;
    }
    rows.push({ n, cells });
  }
  return rows;
}

// ───────────────────────────── templates ─────────────────────────────

const SETTINGS_HEADER = ['quiz_title', 'time_limit_min', 'attempts_allowed', 'show_answers'];
const SETTINGS_SAMPLE: (string | number)[] = ['Java Basics Quiz', 10, 1, 'yes'];
const QUESTIONS_HEADER = ['question_no', 'question_text', 'option_a', 'option_b', 'option_c', 'option_d', 'option_e', 'option_f', 'correct_answer', 'marks', 'negative_marks'];
const QUESTIONS_SAMPLE: (string | number)[][] = [
  [1, 'What is JVM?', 'Java Virtual Machine', 'Java Visual Machine', 'Java Variable Machine', 'None of the above', '', '', 'A', 1, 0],
  [2, 'Which of these are OOP concepts?', 'Encapsulation', 'Recursion', 'Polymorphism', 'Inheritance', 'Abstraction', '', 'A,C,D,E', 2, 0.25],
  [3, 'What is the size of int in Java?', '2 bytes', '4 bytes', '8 bytes', 'Depends on the OS', '', '', 'B', 1, 0],
  [4, 'Java is platform independent.', 'True', 'False', '', '', '', '', 'A', 1, 0],
  [5, 'Which of these are reserved keywords in Java?', 'static', 'goto', 'main', 'final', 'String', 'volatile', 'A,B,D,F', 2, 0.5],
];
const TEMPLATE_ROWS = 500; // dropdowns / text formatting prepared for this many question rows
const HELP_ROWS: string[][] = [
  ['Column', 'What to write', 'Example'],
  ['— Quiz Settings sheet —', 'Row 1 = column names, row 2 = values. All optional.', ''],
  ['quiz_title', 'Lesson title shown to students', 'Java Basics Quiz'],
  ['time_limit_min', 'Time limit in minutes. 0 = no time limit', '10'],
  ['attempts_allowed', 'How many times a student may attempt (1 or more)', '1'],
  ['show_answers', 'yes or no — show the correct answers after submitting', 'yes'],
  ['— Questions sheet —', 'Row 1 = column names, then ONE ROW PER QUESTION', ''],
  ['question_no', 'Just a running number (1, 2, 3 …) — used in error messages', '1'],
  ['question_text', 'The question (required)', 'What is JVM?'],
  ['option_a, option_b', 'Required — every question needs at least 2 options', 'Java Virtual Machine'],
  ['option_c … option_f', 'Optional — leave the cell EMPTY if not needed (do not type N/A)', ''],
  ['correct_answer', 'Letter of the right option. More than one right answer → A,C,D', 'A   or   A,C,D,E'],
  ['marks', 'Marks for a correct answer (empty = 1)', '1'],
  ['negative_marks', 'Marks deducted for a wrong answer (empty = 0)', '0.25'],
  ['', '', ''],
  ['Tips', 'Students must tick ALL correct options (and only those) to get the marks for a multi-answer question.', ''],
  ['', 'Delete the sample questions and type your own. Up to 6 options (A–F) per question.', ''],
  ['', 'Click a correct_answer cell to pick a letter from the dropdown, or type several like A,C.', ''],
  ['', 'You can also save the Questions sheet as CSV and upload the CSV.', ''],
];

/** Download a ready-to-fill template: .xlsx (Settings + Questions + How to fill sheets) or a single-sheet .csv */
export function downloadQuizTemplate(kind: 'xlsx' | 'csv') {
  if (kind === 'csv') saveBlob(buildQuizTemplateCsv(), 'quiz-sample.csv', 'text/csv;charset=utf-8');
  else saveBlob(buildQuizTemplateXlsx() as BlobPart, 'quiz-sample.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}

/** Single-sheet CSV: settings header + values, blank line, questions header + sample questions (BOM so Excel reads UTF-8). */
export function buildQuizTemplateCsv(): string {
  const esc = (v: string | number) => { const s = String(v); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const lines = [SETTINGS_HEADER, SETTINGS_SAMPLE, [], QUESTIONS_HEADER, ...QUESTIONS_SAMPLE].map((r) => r.map(esc).join(','));
  return '﻿' + lines.join('\r\n') + '\r\n';
}

function saveBlob(data: BlobPart, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ── minimal .xlsx writer (inline strings, bold header, frozen header row, text-formatted answer columns) ──

interface XSheet { name: string; rows: (string | number)[][]; widths: number[]; textCols?: number[]; header?: boolean; validations?: string }

/** Excel data-validation rule (dropdown list / number check) with a hint shown when the cell is selected. */
function dv(sqref: string, kind: 'list' | 'decimal' | 'whole', formula: string, title: string, prompt: string, strict: boolean,
  operator: 'greaterThan' | 'greaterThanOrEqual' = 'greaterThanOrEqual') {
  const op = kind === 'list' ? '' : ` operator="${operator}"`;
  const err = strict ? ` showErrorMessage="1" errorTitle="${xmlEsc(title)}" error="${xmlEsc(prompt)}"` : '';
  return `<dataValidation type="${kind}"${op} allowBlank="1" showInputMessage="1"${err} promptTitle="${xmlEsc(title)}" prompt="${xmlEsc(prompt)}" sqref="${sqref}"><formula1>${xmlEsc(formula)}</formula1></dataValidation>`;
}

export function buildQuizTemplateXlsx(): Uint8Array {
  const textCols = [1, 2, 3, 4, 5, 6, 7, 8]; // question_text … correct_answer: typed as text so "1/2" never turns into a date
  const last = TEMPLATE_ROWS + 1;
  const settingsDv = [
    dv('B2', 'decimal', '0', 'Time limit', 'Minutes. 0 = no time limit.', true),
    dv('C2', 'whole', '1', 'Attempts', 'How many times a student may attempt (1 or more).', true),
    dv('D2', 'list', '"yes,no"', 'Show answers', 'yes = show correct answers after submit.', true),
  ];
  const questionDv = [
    // not strict: the dropdown offers single letters, but typing A,C for multiple answers must stay allowed
    dv(`I2:I${last}`, 'list', '"A,B,C,D,E,F"', 'Correct answer', 'Pick the letter of the right option. More than one right answer? Type them like A,C', false),
    dv(`J2:J${last}`, 'decimal', '0', 'Marks', 'Marks for a correct answer, more than 0 (empty = 1).', true, 'greaterThan'),
    dv(`K2:K${last}`, 'decimal', '0', 'Negative marks', 'Marks deducted for a wrong answer (empty = 0).', true),
  ];
  return buildXlsx([
    { name: 'Quiz Settings', rows: [SETTINGS_HEADER, SETTINGS_SAMPLE], widths: [28, 16, 18, 15], header: true,
      validations: `<dataValidations count="${settingsDv.length}">${settingsDv.join('')}</dataValidations>` },
    { name: 'Questions', rows: [QUESTIONS_HEADER, ...QUESTIONS_SAMPLE], widths: [12, 42, 24, 24, 24, 24, 20, 20, 16, 9, 16], textCols, header: true,
      validations: `<dataValidations count="${questionDv.length}">${questionDv.join('')}</dataValidations>` },
    { name: 'How to fill', rows: HELP_ROWS, widths: [24, 90, 22] },
  ]);
}

const xmlEsc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const colName = (i: number) => { let s = ''; for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s; return s; };
const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const NS_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NS_PKG = 'http://schemas.openxmlformats.org/package/2006/relationships';

function sheetXml(s: XSheet, first: boolean): string {
  const text = new Set(s.textCols ?? []);
  const cols = s.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"${text.has(i) ? ' style="2"' : ''}/>`).join('');
  const rows = s.rows.map((r, ri) => {
    const cells = r.map((v, ci) => {
      if (v === '' || v === null || v === undefined) return '';
      const ref = `${colName(ci)}${ri + 1}`;
      const style = ri === 0 && s.header ? ' s="1"' : text.has(ci) ? ' s="2"' : '';
      if (typeof v === 'number') return `<c r="${ref}"${style}><v>${v}</v></c>`;
      const sp = /^\s|\s$/.test(v) ? ' xml:space="preserve"' : '';
      return `<c r="${ref}"${style} t="inlineStr"><is><t${sp}>${xmlEsc(v)}</t></is></c>`;
    }).join('');
    return `<row r="${ri + 1}">${cells}</row>`;
  }).join('');
  const pane = s.header ? '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/>' : '';
  return `${XML_HEAD}<worksheet xmlns="${NS_MAIN}" xmlns:r="${NS_REL}"><sheetViews><sheetView workbookViewId="0"${first ? ' tabSelected="1"' : ''}>${pane}</sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols>${cols}</cols><sheetData>${rows}</sheetData>${s.validations ?? ''}</worksheet>`;
}

function buildXlsx(sheets: XSheet[]): Uint8Array {
  const files: [string, string][] = [
    ['[Content_Types].xml', `${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`],
    ['_rels/.rels', `${XML_HEAD}<Relationships xmlns="${NS_PKG}"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml', `${XML_HEAD}<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_REL}"><bookViews><workbookView activeTab="0"/></bookViews><sheets>${sheets.map((s, i) => `<sheet name="${xmlEsc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', `${XML_HEAD}<Relationships xmlns="${NS_PKG}">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml', `${XML_HEAD}<styleSheet xmlns="${NS_MAIN}"><fonts count="2"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><color rgb="FF4C1D95"/><name val="Calibri"/><family val="2"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEDE9FE"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="49" fontId="1" fillId="2" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1"/><xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`],
    ...sheets.map((s, i): [string, string] => [`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s, i === 0)]),
  ];
  return zipStore(files.map(([name, body]) => [name, new TextEncoder().encode(body)]));
}

let CRC_TABLE: Uint32Array | null = null;
function crc32(data: Uint8Array) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC_TABLE[n] = c >>> 0; }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** Uncompressed ("stored") zip — valid for Excel, LibreOffice, Google Sheets and WPS. */
function zipStore(files: [string, Uint8Array][]): Uint8Array {
  const enc = new TextEncoder();
  const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1; // 2026-01-01
  const local: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const [name, data] of files) {
    const nb = enc.encode(name);
    const crc = crc32(data);
    const lh = new Uint8Array(30 + nb.length);
    const lv = new DataView(lh.buffer);
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0x0800, true); lv.setUint16(8, 0, true);
    lv.setUint16(10, 0, true); lv.setUint16(12, DOS_DATE, true); lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true); lv.setUint32(22, data.length, true); lv.setUint16(26, nb.length, true); lv.setUint16(28, 0, true);
    lh.set(nb, 30);
    const ch = new Uint8Array(46 + nb.length);
    const cv = new DataView(ch.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true); cv.setUint16(12, 0, true); cv.setUint16(14, DOS_DATE, true); cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true); cv.setUint32(24, data.length, true); cv.setUint16(28, nb.length, true);
    cv.setUint32(42, offset, true);
    ch.set(nb, 46);
    local.push(lh, data);
    central.push(ch);
    offset += lh.length + data.length;
  }
  const cdSize = central.reduce((s, c) => s + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true);
  ev.setUint32(12, cdSize, true); ev.setUint32(16, offset, true);
  const out = new Uint8Array(offset + cdSize + 22);
  let p = 0;
  for (const part of [...local, ...central, end]) { out.set(part, p); p += part.length; }
  return out;
}
