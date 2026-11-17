// Phase 0 盲测：4 篇样本 × 3 模型翻译，Kimi k3.1-pro 裁判打分
// 运行：node --env-file=.env.local scripts/blind-test.mjs
import fs from 'node:fs/promises';
import path from 'node:path';
import { segmentText } from '../lib/segmenter.js';
import { getProviderById, chatOnce, translateSegments } from '../lib/providers.js';

const SAMPLES = ['literary', 'news', 'law', 'tech'];
const PROVIDER_IDS = ['deepseek', 'kimi', 'doubao'];
const BATCH = 20;
const OUT_DIR = 'data/blind-test/2026-11-15';

async function readSample(name) {
  const en = await fs.readFile(`data/samples/${name}.en.txt`, 'utf8');
  let ref = null;
  try { ref = await fs.readFile(`data/samples/${name}.zh-ref.txt`, 'utf8'); } catch {}
  return { en, ref };
}

async function translateAll(provider, segments) {
  const out = [];
  for (let i = 0; i < segments.length; i += BATCH) {
    const batch = segments.slice(i, i + BATCH);
    const parts = await translateSegments(provider, batch);
    out.push(...parts.map((l) => l.replace(/^\s*\d+[\t.、)\s]+\s*/, '')));
    console.log(`  [${provider.id}] ${out.length}/${segments.length} 句`);
  }
  return out;
}

const JUDGE_PROMPT = (sample, ref, versions) => `你是资深英译汉翻译质量评审专家。下面是同一篇英文原文的 ${versions.length} 个机器译文版本（编号已对齐原文编号）。请逐维度评估每个版本。

评分维度（每项 1-5 分，5 为最好）：
- accuracy 准确性：语义忠实、无错译漏译
- fluency 流畅性：中文地道通顺
- style 风格保持：与原文文体匹配（文学看韵味，新闻看简洁，法律看严谨，科技看术语准确）
- terminology 术语处理：专名、术语、文化负载词处理得当
- completeness 完整性：无遗漏、无擅自增译

${ref ? `另附一份公认的人工参考译文作为风格标尺，请额外给每个版本打一个 style_vs_reference（0-100，与参考译文风格贴近度）。参考译文：\n${ref.slice(0, 3000)}\n` : ''}
英文原文（带编号）：
${sample}

${versions.map((v) => `【版本 ${v.tag}】\n${v.text}`).join('\n\n')}

只输出 JSON，不要其他内容，格式：
{"versions":[{"tag":"A","scores":{"accuracy":0,"fluency":0,"style":0,"terminology":0,"completeness":0},"style_vs_reference":0,"strengths":"...","weaknesses":"...","example_good":["第x句：..."],"example_bad":["第x句：..."]}],
"ranking":["按综合质量排序，如 B>A>C"],"verdict":"一段话总结各版本适用场景与整合建议（哪家做底稿、从哪家补什么）"}`;

async function judge(sampleNum, ref, versions, judgeProvider) {
  // 不覆盖 temperature：kimi-k3 系列只接受 1，用 provider 自身默认值
  const raw = await chatOnce(judgeProvider, [
    { role: 'system', content: '你只输出合法 JSON，不输出任何其他文字。' },
    { role: 'user', content: JUDGE_PROMPT(sampleNum, ref, versions) },
  ], { maxTokens: 8000 });
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return { parseError: true, raw: raw.slice(0, 2000) };
  try { return JSON.parse(m[0]); } catch { return { parseError: true, raw: raw.slice(0, 2000) }; }
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const providers = PROVIDER_IDS.map(getProviderById).filter(Boolean);
  const judgeProvider = getProviderById('kimi');

  const summary = {};
  for (const name of SAMPLES) {
    console.log(`\n===== ${name} =====`);
    const { en, ref } = await readSample(name);
    const segments = segmentText(en);
    const dir = path.join(OUT_DIR, name);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'segments.json'), JSON.stringify(segments, null, 2));

    const versions = [];
    for (const p of providers) {
      const file = path.join(dir, `${p.id}.txt`);
      let text;
      try {
        text = await fs.readFile(file, 'utf8'); // 复用已有译文缓存
      } catch {
        const translations = await translateAll(p, segments);
        text = translations.map((t, i) => `${i + 1}\t${t}`).join('\n');
        await fs.writeFile(file, text);
      }
      versions.push({ tag: String.fromCharCode(65 + providers.indexOf(p)), provider: p.id, text });
    }

    console.log(`  裁判评分中…`);
    const numbered = segments.map((s, i) => `${i + 1}\t${s}`).join('\n');
    const result = await judge(numbered, ref, versions, judgeProvider);
    await fs.writeFile(path.join(dir, 'judge.json'), JSON.stringify(result, null, 2));
    summary[name] = result;
    console.log(`  完成: ranking=${result.ranking?.join('>') || '解析失败'}`);
  }

  await fs.writeFile(path.join(OUT_DIR, 'summary.json'), JSON.stringify(summary, null, 2));
  console.log('\n全部完成 →', OUT_DIR);
}

main().catch((e) => { console.error(e); process.exit(1); });
