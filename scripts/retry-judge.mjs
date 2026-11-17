// 单独重试指定样本的裁判，打印原始响应以定位失败原因
// node --env-file=.env.local scripts/retry-judge.mjs news tech
import fs from 'node:fs/promises';
import path from 'node:path';
import { segmentText } from '../lib/segmenter.js';
import { getProviderById, chatOnce } from '../lib/providers.js';

const OUT_DIR = 'data/blind-test/2026-11-15';
const PROVIDER_IDS = ['deepseek', 'kimi', 'doubao'];

const JUDGE_PROMPT = (sample, ref, versions) => `你是资深英译汉翻译质量评审专家。下面是同一篇英文原文的 ${versions.length} 个机器译文版本（编号已对齐）。请逐维度评估。

评分维度（1-5，5 最好）：accuracy 准确性 / fluency 流畅性 / style 风格保持 / terminology 术语处理 / completeness 完整性。
${ref ? `另附人工参考译文作风格标尺，请额外给每版打 style_vs_reference（0-100）。参考译文（节选）：\n${ref.slice(0, 2000)}\n` : ''}
英文原文（带编号）：
${sample}

${versions.map((v) => `【版本 ${v.tag}】\n${v.text}`).join('\n\n')}

只输出 JSON：{"versions":[{"tag":"A","scores":{"accuracy":0,"fluency":0,"style":0,"terminology":0,"completeness":0},"style_vs_reference":0,"strengths":"...","weaknesses":"..."}],"ranking":["如 B>A>C"],"verdict":"一段话总结"}`;

async function run(name, judgeProvider) {
  const en = await fs.readFile(`data/samples/${name}.en.txt`, 'utf8');
  let ref = null;
  try { ref = await fs.readFile(`data/samples/${name}.zh-ref.txt`, 'utf8'); } catch {}
  const segments = segmentText(en);
  const versions = [];
  for (const id of PROVIDER_IDS) {
    const text = await fs.readFile(path.join(OUT_DIR, name, `${id}.txt`), 'utf8');
    versions.push({ tag: String.fromCharCode(65 + PROVIDER_IDS.indexOf(id)), provider: id, text });
  }
  const numbered = segments.map((s, i) => `${i + 1}\t${s}`).join('\n');
  const raw = await chatOnce(judgeProvider, [
    { role: 'system', content: '你只输出合法 JSON，不输出任何其他文字。' },
    { role: 'user', content: JUDGE_PROMPT(numbered, ref, versions) },
  ], { maxTokens: 4096 });
  console.log(`\n===== ${name} 原始响应 (len=${raw.length}) =====`);
  console.log(raw.slice(0, 600) || '(空)');
  const m = raw.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      const parsed = JSON.parse(m[0]);
      await fs.writeFile(path.join(OUT_DIR, name, 'judge.json'), JSON.stringify(parsed, null, 2));
      console.log(`  -> 解析成功，ranking=${parsed.ranking?.join('>')}`);
    } catch (e) { console.log('  -> JSON 解析失败:', e.message); }
  } else {
    console.log('  -> 无 JSON，可能触发内容审核或截断');
  }
}

const judgeProvider = getProviderById(process.env.JUDGE_ID || 'deepseek');
console.log('裁判模型:', judgeProvider.id, judgeProvider.model());
for (const name of process.argv.slice(2)) {
  try { await run(name, judgeProvider); } catch (e) { console.error(name, 'ERROR:', e.message); }
}
