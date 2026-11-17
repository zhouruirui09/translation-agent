// node --env-file=.env.local scripts/test-research.mjs literary
import fs from 'node:fs/promises';
import { buildResearchReport } from '../lib/research.js';

const name = process.argv[2] || 'literary';
const text = await fs.readFile(`data/samples/${name}.en.txt`, 'utf8');
console.log(`researching ${name} (${text.length} chars)…`);
const t0 = Date.now();
const out = await buildResearchReport(text);
console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);
console.log('识别:', out.identify);
console.log('检索词:', out.queries);
console.log('来源数:', out.sources.length);
out.sources.slice(0, 6).forEach((s) => console.log('  -', s.title, '|', s.site, '|', s.date));
console.log('\n报告:');
console.log(JSON.stringify(out.report, null, 2));
await fs.mkdir(`data/research/${name}`, { recursive: true });
await fs.writeFile(`data/research/${name}/report.json`, JSON.stringify(out, null, 2));
