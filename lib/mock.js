// 演示模式（未配置任何 API key）：①②④⑤ 返回结构完整的模拟数据，
// 让试用者/面试官零配置也能把全流程点通。所有输出均显式标注"演示数据"，不冒充真实模型结果。
import { pickProfile, DIM_LABELS } from './qe_profiles.js';

export function mockResearch(text, instructions = '') {
  const head = String(text).trim().slice(0, 60).replace(/\s+/g, ' ');
  return {
    identify: `【演示数据】文本以「${head}…」开头——真实模式下这里会显示联网检索识别出的作品、作者与出处。`,
    queries: ['该作品的作者与写作背景', '文本出处与发表信息', '是否已有中文译本', '文本涉及的术语领域'],
    sources: [],
    report: {
      text_type: '文学/人文（演示数据）',
      source: '演示模式：未联网检索。配置 API key 后，此处为检索确认的作品与出处。',
      author: '演示模式：未联网检索。配置 key 后，此处为作者生平与写作风格要点。',
      writing_context: '演示模式：未联网检索。',
      public_translations: '演示模式：未联网检索。配置 key 后，此处列出已有中文译本及译者风格特点。',
      notes: [
        '演示数据：叙述语体克制抒情，译文避免欧化长句',
        '演示数据：人名地名统一按术语表，首现可加注',
        '演示数据：数字、日期与单位逐一核对',
      ],
      difficulties: [
        { item: '长难句切分', where: `第 1 句「${head.slice(0, 30)}…」`, suggestion: '按中文节奏拆成 2-3 个短句' },
        { item: '文化负载词', where: '全文若干处（演示条目）', suggestion: '功能对等译法，避免音译堆砌' },
      ],
      glossary: [
        { en: 'Mr.', zh: '先生', note: '演示条目' },
        { en: 'Mrs.', zh: '太太', note: '演示条目' },
      ],
      confidence: 'low（演示模式，未联网检索）',
      sources_used: [],
    },
  };
}

export function mockBrief({ text, report, decisions, instructions }) {
  const glossaryRows = (report?.glossary || []).map((g) => `| ${g.en} | ${g.zh} |`).join('\n');
  const decided = Object.entries(decisions || {})
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => `- ${k}：${typeof v === 'object' ? JSON.stringify(v, null, 0) : v}`)
    .join('\n');
  return {
    brief_md: `# 文本定位
（演示数据）类型：${report?.text_type || '未指定'}。真实模式下由译前报告汇总而成。

# 目标读者与风格
（演示数据）面向中文普通读者，风格力求自然流畅、贴合原文语域。

# 命名与术语表
| 英文 | 中文 |
|---|---|
${glossaryRows || '|（无）|（无）|'}

# 难点处理决定
${decided || '- （演示数据）本次未做逐条决策，长难句按中文习惯拆译。'}

# 硬性约束
- 禁止未翻译的英文残留（术语表指定保留原文的除外）
- 数字、日期、单位必须与原文逐一核对
- 术语严格按上表执行${instructions ? `\n- 【译员本次附加指令】${instructions}` : ''}`,
    open_questions: ['演示数据：正式译名待联网检索后确认', '演示数据：叙述人称与时态基准待人工定夺'],
  };
}

export function mockAnswer(question) {
  return `【演示模式】你问的是：「${String(question).slice(0, 60)}」。真实模式下，顾问会基于译前报告与原文给出不超过 300 字的专业回答（含推断标注）。当前未配置 API key，本条为模拟回答，仅用于演示对话流程。`;
}

export function mockCompare({ segments, results }) {
  const TAGS = ['甲', '乙', '丙', '丁', '戊'];
  const usable = results.filter((r) => !r.error && Array.isArray(r.translations) && r.translations.length);
  const mapping = usable.slice(0, TAGS.length).map((r, i) => ({ tag: TAGS[i], provider: r.provider, label: r.label }));
  const comparisons = segments.map((_, i) => ({
    n: i + 1,
    diffs: `（演示数据）第 ${i + 1} 句：甲/乙/丙在选词与句读上存在差异，示例描述——甲更贴原文语序，乙更符合中文节奏。`,
    advice: i % 4 === 3 ? '（演示数据）建议以乙为底本，吸收甲的术语处理。' : '（演示数据）底本可直接采用，个别标点微调。',
    base: TAGS[i % Math.max(1, mapping.length)] || null,
    baseProvider: mapping.length ? mapping[i % mapping.length].provider : null,
    baseLabel: mapping.length ? mapping[i % mapping.length].label : null,
  }));
  return { judgeLabel: '演示模式（模拟裁判）', mapping, comparisons, errors: [] };
}

export function mockQe({ segments, final, textType }) {
  const [profileKey, profile] = pickProfile(textType);
  const scores = { accuracy: 88, fluency: 85, style: 87, terminology: 90, completeness: 92 };
  let weighted = 0;
  for (const [k, v] of Object.entries(scores)) weighted += v * profile.weights[k];
  const per_sentence = segments.map((_, i) => {
    const zh = String(final[i] || '').trim();
    if (!zh) return { n: i + 1, verdict: 'major', problems: [{ dim: '完整', desc: '演示数据：该句定稿为空，按漏译处理', fix: '补译该句' }] };
    if ((i + 1) % 5 === 0)
      return { n: i + 1, verdict: 'minor', problems: [{ dim: '流畅', desc: '演示数据：模拟的可改进点（句式略欧化）', fix: '模拟建议：调整语序，拆长定语' }] };
    return { n: i + 1, verdict: 'pass', problems: [] };
  });
  const majors_count = per_sentence.filter((p) => p.verdict === 'major').length;
  return {
    judgeLabel: '演示模式（模拟裁判）',
    profile: { key: profileKey, label: `${profile.label}（演示）`, weights: profile.weights },
    dimLabels: DIM_LABELS,
    scores,
    weighted_total: Math.round(weighted),
    per_sentence,
    majors_count,
    errors: [],
    summary: `【演示数据】整体结论：译文基本可交付（模拟总分 ${Math.round(weighted)}，权重 profile：${profile.label}）。真实模式下，裁判模型会逐句判定 pass/minor/major、给出五维分与总评，并叠加规则校验（英文残留/术语合规/数字核对/漏译）。`,
  };
}
