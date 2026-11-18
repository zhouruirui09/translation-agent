// Phase 3 逐句三版比较：匿名化（甲/乙/丙）→ 裁判模型逐句分析实质差异、推荐底本、给整合意见。
// 匿名是为了防止裁判按模型身份偏心；映射关系随结果返回，供 UI 展示。
import { getProviderById, chatOnce, isMockMode } from './providers.js';
import { mockCompare } from './mock.js';

const BATCH_SIZE = 5;
const TAGS = ['甲', '乙', '丙', '丁', '戊'];

function parseLineMap(lines = []) {
  const map = {};
  for (const line of lines) {
    const m = String(line).match(/^(\d+)\t([\s\S]*)$/);
    if (m) map[Number(m[1])] = m[2];
  }
  return map;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const SYSTEM =
  '你是资深英译汉审校与出版编辑，擅长比较多个译文版本并给出整合建议。只输出合法 JSON，不输出任何其他内容。';

function judgePrompt(rows, tags, brief) {
  const body = rows
    .map((r) => `【第${r.n}句】\n原文：${r.en}\n${tags.map((t) => `${t}：${r[t] || '（缺失）'}`).join('\n')}`)
    .join('\n\n');
  return `下面是若干英文原句及${tags.length}个匿名的中文译文版本（${tags.join('/')}）。` +
    (brief ? `\n本次翻译的译前指令（术语与文体判断以此为准）：\n${String(brief).slice(0, 2500)}\n` : '') +
    `
请逐句完成两件事：
1. diffs：指出版本间的实质性差异（术语选词、句读切分、语气反讽再现、语域），并说明谁的处理更好；无关紧要的风格小异不必罗列。
2. advice：给出整合意见——以哪个版本为底本、从哪个版本吸收什么表述或如何改；若底本可直接用，写"底本可直接采用"。

输出 JSON 数组，每句一个元素，覆盖给出的全部句号：
[{"n": 句号, "diffs": "差异说明", "base": "${tags.join('|')}", "advice": "整合意见"}]

${body}`;
}

function parseArray(raw, label) {
  const m = String(raw).match(/\[[\s\S]*\]/);
  if (!m) throw new Error(`${label} 裁判未返回 JSON 数组，原始输出：${JSON.stringify(String(raw).slice(0, 200))}`);
  try {
    return JSON.parse(m[0]);
  } catch (e) {
    throw new Error(`${label} JSON 解析失败：${e.message}`);
  }
}

async function judgeBatch(judge, rows, tags, brief) {
  // k3 是推理模型，思考链计入 max_tokens，预算要给足否则正文为空
  const maxTokens = judge.id === 'kimi' ? 16000 : 4000;
  let lastErr;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const raw = await chatOnce(
        judge,
        [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: judgePrompt(rows, tags, brief) },
        ],
        { temperature: 0.3, maxTokens }
      );
      return parseArray(raw, `[第${rows[0].n}-${rows[rows.length - 1].n}句]`);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

export async function compareTranslations({ segments = [], results = [], brief = '', judgeId = 'deepseek' }) {
  const judge = getProviderById(judgeId);
  if (!judge) throw new Error(`裁判模型 ${judgeId} 未配置`);

  const usable = results.filter((r) => !r.error && Array.isArray(r.translations) && r.translations.length);
  if (usable.length < 2) throw new Error('可用译文不足两个，无法逐句比较');
  if (isMockMode()) return mockCompare({ segments, results: usable });

  const tags = TAGS.slice(0, usable.length);
  const anon = shuffle(usable).map((r, i) => ({
    tag: tags[i],
    provider: r.provider,
    label: r.label,
    map: parseLineMap(r.translations),
  }));
  const mapping = anon.map(({ tag, provider, label }) => ({ tag, provider, label }));

  const rowsAll = segments.map((en, i) => {
    const row = { n: i + 1, en };
    for (const v of anon) row[v.tag] = v.map[i + 1] || '';
    return row;
  });

  const batches = [];
  for (let i = 0; i < rowsAll.length; i += BATCH_SIZE) batches.push(rowsAll.slice(i, i + BATCH_SIZE));

  const settled = await Promise.allSettled(batches.map((b) => judgeBatch(judge, b, tags, brief)));
  const byN = new Map();
  const errors = [];
  settled.forEach((s, bi) => {
    if (s.status === 'fulfilled') {
      for (const item of s.value) {
        if (item && Number.isInteger(Number(item.n))) byN.set(Number(item.n), item);
      }
    } else {
      errors.push(`第${batches[bi][0].n}-${batches[bi][batches[bi].length - 1].n}句：${s.reason?.message || s.reason}`);
    }
  });

  const comparisons = rowsAll.map(({ n }) => {
    const item = byN.get(n) || null;
    const baseTag = item && tags.includes(String(item.base)) ? String(item.base) : null;
    const m = anon.find((v) => v.tag === baseTag);
    return {
      n,
      diffs: item?.diffs || '（裁判未分析本句）',
      advice: item?.advice || '',
      base: baseTag,
      baseProvider: m ? m.provider : null,
      baseLabel: m ? m.label : null,
    };
  });

  return { judgeLabel: judge.label, mapping, comparisons, errors };
}
