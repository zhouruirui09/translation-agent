// 上传文档解析：txt/md 直接解码；docx 用 mammoth 提纯文本；PDF 用 pdfjs-dist 按行聚类、依行距还原段落。
// 机器解析质量参差不齐，调用方应提示用户回文本框校对后再继续。
import { extractRawText } from 'mammoth';

export async function parseDocument(filename, buffer) {
  const ext = (String(filename).match(/\.[a-z0-9]+$/i) || [''])[0].toLowerCase();
  if (ext === '.txt' || ext === '.md') return normalize(buffer.toString('utf8'));
  if (ext === '.docx') {
    const r = await extractRawText({ buffer });
    return normalize(typeof r === 'string' ? r : r.value || '');
  }
  if (ext === '.pdf') return normalize(await parsePdf(buffer));
  throw new Error(`暂不支持 ${ext || '该'}格式，请使用 .txt / .md / .docx / .pdf`);
}

function normalize(t) {
  return t
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function parsePdf(buffer) {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await getDocument({ data: new Uint8Array(buffer), verbosity: 0 }).promise;
  const pages = [];
  for (let p = 1; p <= doc.numPages; p++) pages.push(await extractPage(await doc.getPage(p)));
  // 连字符断词还原：well-\nknown → well-known
  return pages.join('\n\n').replace(/([a-z])- *\n *([a-z])/gi, '$1$2');
}

async function extractPage(page) {
  const tc = await page.getTextContent();
  const items = tc.items
    .filter((it) => typeof it.str === 'string' && it.str.trim())
    .sort((a, b) => b.transform[5] - a.transform[5] || a.transform[4] - b.transform[4]);

  const lines = [];
  let cur = null;
  for (const it of items) {
    const y = it.transform[5];
    if (!cur || Math.abs(y - cur.y) > 2.5) { cur = { y, parts: [it.str] }; lines.push(cur); }
    else cur.parts.push(it.str);
  }
  const rows = lines
    .map((l) => ({ y: l.y, text: l.parts.join(' ').replace(/\s+/g, ' ').trim() }))
    .filter((l) => l.text);
  if (!rows.length) return '';

  // 行距中位数放大视为段落间隔
  const gaps = [];
  for (let i = 1; i < rows.length; i++) {
    const g = rows[i - 1].y - rows[i].y;
    if (g > 0) gaps.push(g);
  }
  gaps.sort((a, b) => a - b);
  const median = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 12;

  let out = '';
  for (let i = 0; i < rows.length; i++) {
    if (i > 0) out += rows[i - 1].y - rows[i].y > median * 1.55 ? '\n\n' : '\n';
    out += rows[i].text;
  }
  return out;
}
