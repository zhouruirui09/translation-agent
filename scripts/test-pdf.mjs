const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
const fs = await import('node:fs');

const buffer = fs.readFileSync('/tmp/pdftest/sample.pdf');
const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer), verbosity: 0 }).promise;

const pageTexts = [];
for (let p = 1; p <= doc.numPages; p++) {
  const page = await doc.getPage(p);
  const tc = await page.getTextContent();
  const items = tc.items
    .filter((it) => typeof it.str === 'string' && it.str.trim() !== '')
    .sort((a, b) => b.transform[5] - a.transform[5] || a.transform[4] - b.transform[4]);

  const lines = [];
  let cur = null;
  for (const it of items) {
    const y = it.transform[5];
    if (!cur || Math.abs(y - cur.y) > 2.5) { cur = { y, parts: [it.str] }; lines.push(cur); }
    else cur.parts.push(it.str);
  }
  const rows = lines.map((l) => ({ y: l.y, text: l.parts.join(' ').replace(/\s+/g, ' ').trim() })).filter((l) => l.text);

  const gaps = [];
  for (let i = 1; i < rows.length; i++) gaps.push(rows[i - 1].y - rows[i].y);
  gaps.sort((a, b) => a - b);
  const median = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 12;

  let out = '';
  for (let i = 0; i < rows.length; i++) {
    if (i > 0) {
      const gap = rows[i - 1].y - rows[i].y;
      out += gap > median * 1.55 ? '\n\n' : '\n';
    }
    out += rows[i].text;
  }
  pageTexts.push(out);
}
try { await pdfjs.destroy?.(); } catch {}

let text = pageTexts.join('\n\n');
text = text.replace(/([a-z])- *\n *([a-z])/g, '$1$2');
text = text.replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

fs.writeFileSync('/tmp/pdftest/out.txt', text);
console.log('chars:', text.length);
console.log(text.slice(0, 500));
console.log('...');
console.log(text.slice(-300));
