/**
 * PDF 1.4 minimal (Helvetica WinAnsi) — récaps Fuel sans dépendance.
 * Accents français via WinAnsiEncoding.
 */

const PAGE_W = 595;
const PAGE_H = 842;
const MARGIN = 48;
const LINE = 13;

function winAnsiByte(codePoint: number): number {
  if (codePoint === 0x20ac) return 128; // €
  if (codePoint === 0x2019) return 146; // ’
  if (codePoint === 0x2018) return 145;
  if (codePoint === 0x2013) return 150;
  if (codePoint === 0x2014) return 151;
  if (codePoint < 256) return codePoint;
  return 63; // ?
}

function pdfLiteral(text: string): string {
  let out = '(';
  for (const ch of text) {
    const b = winAnsiByte(ch.codePointAt(0) || 63);
    if (b === 92 || b === 40 || b === 41) {
      out += `\\${String.fromCharCode(b)}`;
    } else if (b < 32 || b > 126) {
      out += `\\${b.toString(8).padStart(3, '0')}`;
    } else {
      out += String.fromCharCode(b);
    }
  }
  return `${out})`;
}

function strBytes(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
}

export type PdfLine = {
  text: string;
  size?: number;
  bold?: boolean;
};

export function wrapPdfLine(text: string, max = 96): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return [''];
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length > max && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = next;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function pageContent(lines: PdfLine[]): string {
  const ops: string[] = ['BT'];
  let y = PAGE_H - MARGIN;
  let font = '';
  let size = 0;
  for (const line of lines) {
    const s = line.size ?? 10;
    const f = line.bold ? '/F2' : '/F1';
    if (y < MARGIN + 16) break;
    if (f !== font || s !== size) {
      ops.push(`${f} ${s} Tf`);
      font = f;
      size = s;
    }
    ops.push(`1 0 0 1 ${MARGIN} ${y.toFixed(1)} Tm ${pdfLiteral(line.text)} Tj`);
    y -= line.size && line.size >= 16 ? LINE + 6 : LINE;
  }
  ops.push('ET');
  return ops.join('\n');
}

function paginate(lines: PdfLine[], maxLines = 52): PdfLine[][] {
  const pages: PdfLine[][] = [];
  let buf: PdfLine[] = [];
  let used = 0;
  for (const line of lines) {
    const cost = line.size && line.size >= 16 ? 2 : 1;
    if (used + cost > maxLines && buf.length) {
      pages.push(buf);
      buf = [];
      used = 0;
    }
    buf.push(line);
    used += cost;
  }
  if (buf.length) pages.push(buf);
  return pages.length ? pages : [[{ text: ' ' }]];
}

export function buildSimplePdf(lines: PdfLine[]): Uint8Array {
  const pages = paginate(lines);
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [0];
  let pos = 0;
  const push = (s: string) => {
    const b = strBytes(s);
    chunks.push(b);
    pos += b.length;
  };

  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');

  const obj = (n: number, body: string) => {
    offsets[n] = pos;
    push(`${n} 0 obj\n${body}\nendobj\n`);
  };

  const pageCount = pages.length;
  const contentIds: number[] = [];
  const pageIds: number[] = [];
  let nextId = 6;
  obj(5, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  obj(6, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  nextId = 7;

  pages.forEach((pageLines) => {
    const stream = pageContent(pageLines);
    const cid = nextId++;
    const pid = nextId++;
    contentIds.push(cid);
    pageIds.push(pid);
    obj(
      cid,
      `<< /Length ${strBytes(stream).length} >>\nstream\n${stream}\nendstream`
    );
    obj(
      pid,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Contents ${cid} 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>`
    );
  });

  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(
    2,
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageCount} >>`
  );
  obj(3, '<< /Producer (Hubera Fuel) /Title (Recap Hubera Fuel) >>');
  obj(4, '<< >>');

  const xrefPos = pos;
  const maxId = nextId - 1;
  let xref = `xref\n0 ${maxId + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= maxId; i++) {
    const off = offsets[i] ?? 0;
    xref += `${String(off).padStart(10, '0')} 00000 n \n`;
  }
  push(xref);
  push(
    `trailer\n<< /Size ${maxId + 1} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`
  );

  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

export function uint8ToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
