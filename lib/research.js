// 译前背景检索报告：识别文本 → Kimi search_pro 联网检索 → 生成结构化报告
import { getProviderById, chatOnce } from './providers.js';
import { webSearchPro, formatResults } from './websearch.js';

const EXTRACT_PROMPT = `分析下面这篇英文文本，输出 JSON（不要其他内容）：
{
 "identify": "一句话判断这是什么文本（书名/文章标题/法规名/作者，若不确定就说明线索）",
 "queries": ["2-4 条联网检索查询词，中文，具体、含实体词，分别覆盖：作品与作者背景、写作背景与出处、是否有中文译本、文本涉及的术语领域"]
}
文本开头片段：
`;

const REPORT_PROMPT = (text, results, instructions) => `你是资深翻译项目顾问。基于联网检索到的资料，为下面这篇待翻译的英文文本撰写译前准备报告。

${instructions ? `译员补充说明（请优先据此检索核实，但仍以证据为准）：\n${instructions}\n` : ''}要求输出 JSON（不要其他内容）：
{
 "text_type": "文本类型（文学/新闻/法律/科技/其他，及子类）",
 "source": "出处（作品名、发表平台、日期等）",
 "author": "作者及其背景（生平要点、写作风格、地位）",
 "writing_context": "写作/发布背景",
 "public_translations": "是否有公开中文译本；有则列出主要译本与译者风格特点，无则说明",
 "notes": ["翻译注意事项/建议，3-6 条"],
 "difficulties": [{"item": "难点（双关/典故/长难句/术语/文化负载词等）", "where": "出现在哪一句（引用原文关键词）", "suggestion": "处理建议"}],
 "glossary": [{"en": "英文术语", "zh": "建议译法", "note": "依据/来源"}],
 "confidence": "high|medium|low（检索资料是否足以支撑以上判断）",
 "sources_used": ["实际引用的资料标题列表"]
}
若检索资料不足以确认某项（如具体译本），在对应字段明确写"未能确认"，不要编造。

联网检索资料：
${results.slice(0, 12000)}

待翻译文本（节选，可能截断）：
${text.slice(0, 12000)}`;

async function generateReport(kimi, text, results, instructions) {
  const attempts = [
    { maxTokens: 24000, extra: '' },
    { maxTokens: 16000, extra: '\n重要：上次同类输出因过长被截断。这次务必在预算内完整收尾：difficulties 最多 5 条且每条 note ≤ 60 字，glossary 最多 10 条且 note ≤ 40 字，宁可精炼不可断尾。' },
  ];
  let lastErr;
  for (const a of attempts) {
    try {
      const raw = await chatOnce(
        kimi,
        [
          { role: 'system', content: '你是翻译顾问，只输出合法 JSON。资料不足时如实标注，严禁编造。' },
          { role: 'user', content: REPORT_PROMPT(text, formatResults(results), instructions) + a.extra },
        ],
        { maxTokens: a.maxTokens }
      );
      return parseJson(raw, '[报告]');
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

function parseJson(raw, label = '') {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) throw new Error(`${label} 模型未返回 JSON，原始输出: ${JSON.stringify(raw.slice(0, 300))}`);
  try {
    return JSON.parse(m[0]);
  } catch (e) {
    throw new Error(`${label} JSON 解析失败: ${e.message}，尾部: ${JSON.stringify(m[0].slice(-200))}`);
  }
}

export async function buildResearchReport(text, instructions = '') {
  const deepseek = getProviderById('deepseek');
  const kimi = getProviderById('kimi');

  // 1. 识别 + 生成检索词（译员备注是重要线索，一并给识别模型）
  const extracted = parseJson(
    await chatOnce(deepseek, [
      { role: 'system', content: '你只输出合法 JSON。' },
      { role: 'user', content: EXTRACT_PROMPT + text.slice(0, 1500) + (instructions.trim() ? `\n\n译员备注：${instructions.trim()}` : '') },
    ], { maxTokens: 800 }),
    '[识别]'
  );

  // 2. 联网检索（每条查询独立调用 search_pro，合并去重）
  const seen = new Set();
  const results = [];
  for (const q of (extracted.queries || []).slice(0, 4)) {
    try {
      const rs = await webSearchPro(q, { limit: 4 });
      for (const r of rs) {
        if (!seen.has(r.url)) { seen.add(r.url); results.push(r); }
      }
    } catch (e) {
      console.warn('search failed for', q, e.message);
    }
  }

  // 3. Kimi 撰写结构化报告（k3 是推理模型，思考链也计入 max_tokens，预算给足；
  //    中档长文报告条目多，预算顶到会出现截断的非法 JSON → 第二次带"必须收尾"指令重试）
  const report = await generateReport(kimi, text, results, instructions);

  return {
    identify: extracted.identify,
    queries: extracted.queries,
    sources: results.map((r) => ({ title: r.title, url: r.url, site: r.site, date: r.date })),
    report,
  };
}
