// Phase 4 LLM 裁判：逐句 verdict（pass/minor/major）+ 分批五维分 + 汇总加权总分 + 总评。
import { getProviderById, chatOnce } from './providers.js';
import { pickProfile, DIM_LABELS } from './qe_profiles.js';

const BATCH_SIZE = 10;

const SYSTEM = '你是资深英译汉翻译质量评估专家，评估尺度稳定、对事不对人。只输出合法 JSON，不输出任何其他内容。';

function judgePrompt(rows, brief, textType) {
  const body = rows.map((r) => `【第${r.n}句】\n原文：${r.en}\n定稿：${r.zh}`).join('\n\n');
  return `文本类型：${textType || '未指定'}。下面是英文原句与译员定稿译文，请逐句做质量评估。` +
    (brief ? `\n译前指令（术语与文体要求，术语违规必须指出）：\n${String(brief).slice(0, 2500)}\n` : '') + `
逐句判定 verdict：
- pass：无实质问题，可交付
- minor：有可商榷问题（术语不统一、明显欧化句式、语气/语域偏差）
- major：硬伤（错译、漏译、无依据增译、数字/日期/单位/人名错误、未翻译残留）
problems 每项格式 {"dim":"准确|流畅|文体|术语|完整","desc":"问题描述（引用具体词）","fix":"修改建议"}；无问题则 problems 为空数组。
再对本批译文整体给出 0-100 五维分（70=及格，85=出版级，95+=优秀）：
accuracy 准确性 / fluency 流畅性 / style 文体语域贴合 / terminology 术语统一 / completeness 完整无漏增。

输出 JSON（不要其他内容）：
{"scores":{"accuracy":0,"fluency":0,"style":0,"terminology":0,"completeness":0},"items":[{"n":句号,"verdict":"pass","problems":[]}]}

${body}`;
}

function parseJson(raw, label) {
  const m = String(raw).match(/\{[\s\S]*\}/);
  if (!m) throw new Error(`${label} 裁判未返回 JSON，原始输出：${JSON.stringify(String(raw).slice(0, 200))}`);
  try {
    return JSON.parse(m[0]);
  } catch (e) {
    throw new Error(`${label} JSON 解析失败：${e.message}`);
  }
}

async function judgeBatch(judge, rows, brief, textType) {
  // k3 是推理模型，思考链计入 max_tokens，预算要给足否则正文为空
  const maxTokens = judge.id === 'kimi' ? 16000 : 4000;
  let lastErr;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const raw = await chatOnce(
        judge,
        [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: judgePrompt(rows, brief, textType) },
        ],
        { temperature: 0.2, maxTokens }
      );
      return parseJson(raw, `[第${rows[0].n}-${rows[rows.length - 1].n}句]`);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

export async function assessQuality({ segments = [], final = [], brief = '', textType = '', judgeId = 'deepseek', ruleSummary = null }) {
  const judge = getProviderById(judgeId);
  if (!judge) throw new Error(`评估模型 ${judgeId} 未配置`);

  const rowsAll = segments.map((en, i) => ({ n: i + 1, en, zh: (final[i] || '').trim() }));
  const batches = [];
  for (let i = 0; i < rowsAll.length; i += BATCH_SIZE) batches.push(rowsAll.slice(i, i + BATCH_SIZE));

  const settled = await Promise.allSettled(batches.map((b) => judgeBatch(judge, b, brief, textType)));
  const errors = [];
  const scoreLists = { accuracy: [], fluency: [], style: [], terminology: [], completeness: [] };
  const byN = new Map();
  settled.forEach((s, bi) => {
    if (s.status !== 'fulfilled') {
      errors.push(`第${batches[bi][0].n}-${batches[bi][batches[bi].length - 1].n}句：${s.reason?.message || s.reason}`);
      return;
    }
    const { scores, items } = s.value;
    for (const key of Object.keys(scoreLists)) {
      const v = Number(scores?.[key]);
      if (Number.isFinite(v)) scoreLists[key].push(Math.min(100, Math.max(0, v)));
    }
    for (const it of items || []) {
      if (it && Number.isInteger(Number(it.n))) byN.set(Number(it.n), it);
    }
  });

  const [profileKey, profile] = pickProfile(textType);
  const scores = {};
  const weights = profile.weights;
  let weighted = 0;
  for (const key of Object.keys(scoreLists)) {
    const arr = scoreLists[key];
    const avg = arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;
    scores[key] = avg;
    if (avg !== null) weighted += avg * weights[key];
  }
  const covered = Object.values(scoreLists).some((a) => a.length);
  const weighted_total = covered ? Math.round(weighted) : null;

  const per_sentence = rowsAll.map(({ n }) => {
    const it = byN.get(n);
    return {
      n,
      verdict: ['pass', 'minor', 'major'].includes(it?.verdict) ? it.verdict : it ? 'unknown' : 'unjudged',
      problems: Array.isArray(it?.problems) ? it.problems : [],
    };
  });

  // 总评：把五维分、major 句和规则疑点浓缩成一段结论
  const majors = per_sentence.filter((p) => p.verdict === 'major').map((p) => `第${p.n}句：${p.problems.map((x) => x.desc).join('；')}`);
  let summary = '';
  try {
    summary = await chatOnce(
      judge,
      [
        { role: 'system', content: SYSTEM },
        {
          role: 'user',
          content: `请为这次英译汉定稿质量评估写 3-5 句中文总评（直接输出纯文本，不要 JSON）：先给整体结论（可交付/需修订/需重译），再点出最突出的 1-2 类问题。若信息不足请如实说明。\n文本类型：${textType || '未指定'}（权重 profile：${profile.label}）\n五维分：${JSON.stringify(scores)}\n加权总分：${weighted_total}\nmajor 句：${majors.length ? majors.slice(0, 12).join(' | ') : '无'}\n规则校验疑点：${ruleSummary ? JSON.stringify(ruleSummary) : '未提供'}`,
        },
      ],
      { temperature: 0.3, maxTokens: judge.id === 'kimi' ? 4000 : 800 }
    );
  } catch (e) {
    summary = `（总评生成失败：${e.message}）`;
  }
  // 推理模型有时无视"纯文本"要求仍包一层 JSON，剥掉取其中的字符串值
  summary = summary.trim();
  if (/^\{[\s\S]*\}$/.test(summary)) {
    try {
      const obj = JSON.parse(summary);
      const val = Object.values(obj).find((x) => typeof x === 'string');
      if (val) summary = val;
    } catch {}
  }

  return {
    judgeLabel: judge.label,
    profile: { key: profileKey, label: profile.label, weights },
    dimLabels: DIM_LABELS,
    scores,
    weighted_total,
    per_sentence,
    majors_count: majors.length,
    errors,
    summary: String(summary).trim(),
  };
}
