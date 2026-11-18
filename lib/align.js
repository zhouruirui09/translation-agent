// 评估指定译文模式：把用户提供的中文译文与英文原文按句对齐。
// 规则切分双方 → 等句数直接 1:1；否则 LLM 全局编号对齐；校验失败退回比例贪心切分。
// 对齐结果永远供人工逐句核对后再生成定稿，这里不追求 100% 正确，追求可控 + 有提示。
import { getProviderById, chatOnce, isMockMode } from './providers.js';
import { segmentText } from './segmenter.js';

const MAX_ALIGN_SENTENCES = 200;

// 中文按句切分：句末标点收尾（含连续标点与反引号），段落间空行分段
export function splitChinese(text) {
  const paras = String(text)
    .split(/\n\s*\n+/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const out = [];
  for (const p of paras) {
    let buf = '';
    for (let i = 0; i < p.length; i++) {
      buf += p[i];
      if ('。！？；…'.includes(p[i])) {
        let j = i + 1;
        while (j < p.length && ('。！？；…'.includes(p[j]) || '"”』）\'’'.includes(p[j]) || p[j] === ' ')) buf += p[j++];
        out.push(buf.trim());
        buf = '';
        i = j - 1;
      }
    }
    if (buf.trim()) out.push(buf.trim());
  }
  return out;
}

function parseJsonArray(raw) {
  const m = String(raw).match(/\[[\s\S]*\]/);
  if (!m) throw new Error('对齐模型未返回 JSON 数组');
  try {
    return JSON.parse(m[0]);
  } catch (e) {
    throw new Error(`对齐结果 JSON 解析失败：${e.message}`);
  }
}

// 校验模型给出的分组：覆盖 1..enCount 每个 n、中文片段严格连续递增、1..zhCount 不重不漏（允许某句为空=漏译）
function validateGroups(items, enCount, zhCount) {
  if (!Array.isArray(items)) return null;
  const byN = new Map();
  for (const it of items) {
    const n = Number(it?.n);
    const zhs = Array.isArray(it?.zh) ? it.zh.map(Number) : null;
    if (!Number.isInteger(n) || n < 1 || n > enCount || !zhs) return null;
    if (zhs.some((z) => !Number.isInteger(z) || z < 1 || z > zhCount)) return null;
    byN.set(n, [...zhs].sort((a, b) => a - b));
  }
  const groups = [];
  let expected = 1;
  for (let n = 1; n <= enCount; n++) {
    if (!byN.has(n)) return null;
    const zhs = byN.get(n);
    for (const z of zhs) {
      if (z !== expected) return null;
      expected++;
    }
    groups.push({ n, zh: zhs });
  }
  if (expected !== zhCount + 1) return null;
  return groups;
}

// 兜底：zhCount 个片段尽量均匀分给 enCount 句（前 rem 组多分 1 个）
function greedyGroups(enCount, zhCount) {
  const base = Math.floor(zhCount / enCount);
  const rem = zhCount % enCount;
  const groups = [];
  let cursor = 1;
  for (let n = 1; n <= enCount; n++) {
    const take = base + (n <= rem ? 1 : 0);
    const idxs = [];
    for (let k = 0; k < take; k++) idxs.push(cursor++);
    groups.push({ n, zh: idxs });
  }
  return groups;
}

function alignPrompt(en, zh) {
  return `英文原文共 ${en.length} 句（已编号），中文译文共 ${zh.length} 个句子片段（已编号）。
请把每个英文句子对应到若干连续的中文片段：
- 允许一个英文句对应多个中文片段（译文拆句），也允许多个英文句按顺序共用（这里仍按逐英文句给其分配的中文片段编号）
- 若某英文句在译文中确实缺失，zh 给空数组 []
- 中文片段编号必须按顺序全部分配完毕、不重不漏
只输出 JSON 数组，覆盖 n=1..${en.length}：[{"n":1,"zh":[1]},{"n":2,"zh":[2,3]},…]

【英文原文】
${en.map((s, i) => `${i + 1}. ${s}`).join('\n')}

【中文译文】
${zh.map((s, i) => `${i + 1}. ${s}`).join('\n')}`;
}

export async function alignTranslation({ sourceText, targetText, judgeId = 'deepseek' }) {
  const en = segmentText(sourceText);
  const zh = splitChinese(targetText);
  if (!en.length) throw new Error('原文没有切分出句子');
  if (!zh.length) throw new Error('译文没有切分出句子（请确认粘贴的是中文译文）');
  if (en.length > MAX_ALIGN_SENTENCES) {
    throw new Error(`对齐目前支持 ${MAX_ALIGN_SENTENCES} 句以内（本次原文 ${en.length} 句）；超长文本将随长文支持一并实现`);
  }

  const warnings = [];
  let method = 'equal';
  let groups = null;

  if (en.length === zh.length) {
    groups = en.map((_, i) => ({ n: i + 1, zh: [i + 1] }));
  } else {
    if (isMockMode()) {
      groups = greedyGroups(en.length, zh.length);
      method = 'greedy';
      warnings.push('演示模式：未调用模型，按位置比例切分对齐，请逐句核对');
    } else {
      const judge = getProviderById(judgeId) || getProviderById('deepseek');
      if (!judge) throw new Error('没有可用的对齐模型');
      try {
        // k3 推理模型思考链计入预算，给足
        const maxTokens = judge.id === 'kimi' ? 16000 : 8000;
        const raw = await chatOnce(judge, [
          { role: 'system', content: '你是翻译校对专家，擅长把中文译文与英文原文逐句对齐。只输出合法 JSON，不输出任何其他内容。' },
          { role: 'user', content: alignPrompt(en, zh) },
        ], { temperature: 0.2, maxTokens });
        groups = validateGroups(parseJsonArray(raw), en.length, zh.length);
        if (groups) method = 'llm';
      } catch (e) {
        warnings.push(`模型对齐失败（${e.message}）`);
      }
      if (!groups) {
        groups = greedyGroups(en.length, zh.length);
        method = 'greedy';
        warnings.push(`原文 ${en.length} 句 / 译文 ${zh.length} 句，采用按位置比例切分，对齐可能不准，请逐句核对`);
      }
    }
  }

  const aligned = groups.map((g) => g.zh.map((z) => zh[z - 1]).join('').trim());
  const missing = aligned.filter((t) => !t).length;
  if (missing) warnings.push(`${missing} 个英文句在译文中未找到对应片段，评估将按漏译处理`);

  return { segments: en, aligned, zhSegments: zh, method, warnings, enCount: en.length, zhCount: zh.length };
}
