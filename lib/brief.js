// 译前对齐环节：自由问答 + brief 汇总生成（用 DeepSeek，快且够聪明）
import { getProviderById, chatOnce } from './providers.js';

function parseJson(raw, label = '') {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) throw new Error(`${label} 模型未返回 JSON: ${JSON.stringify(raw.slice(0, 200))}`);
  try { return JSON.parse(m[0]); } catch (e) {
    throw new Error(`${label} JSON 解析失败: ${e.message}`);
  }
}

export async function answerQuestion({ text, report, question, history }) {
  const deepseek = getProviderById('deepseek');
  const context = `英文原文（节选）：\n${text.slice(0, 3000)}\n\n译前报告：\n${JSON.stringify(report).slice(0, 6000)}`;
  const messages = [
    { role: 'system', content: `你是翻译顾问，协助译员深入理解一篇待翻译的英文文本。基于给定原文与报告回答译员的问题；报告里没有的信息如实说明并给出你的专业判断（标注为推断）。回答简洁，中文，不超过 300 字。\n\n${context}` },
    ...(history || []).slice(-6),
    { role: 'user', content: question },
  ];
  return chatOnce(deepseek, messages, { maxTokens: 800 });
}

const BRIEF_PROMPT = (text, report, decisions, chatLog, instructions) => `把以下材料汇总成一份"翻译指令（translation brief）"，供翻译模型严格执行。

要求输出 JSON：
{
 "brief_md": "markdown 格式的 brief，包含五节：\\n# 文本定位（类型/出处/作者，2-3行）\\n# 目标读者与风格（依据用户决策）\\n# 命名与术语表（表格：英文|中文，只收录已确认项，用户改过的以用户为准）\\n# 难点处理决定（逐条：难点→决定）\\n# 硬性约束（禁止事项，如禁止英文残留、数字单位必须核对）",
 "open_questions": ["用户决策未覆盖、建议人工定夺的遗留问题"]
}

译前报告：
${JSON.stringify(report).slice(0, 8000)}

用户决策（JSON，null 表示未选择）：
${JSON.stringify(decisions)}

对话记录（用户与顾问的问答，注意采纳对话中用户表达过的倾向）：
${chatLog.slice(0, 3000) || '（无）'}

原文开头（供参考）：
${text.slice(0, 800)}${instructions ? `

译员本次附加指令（必须逐条体现在 brief 相应章节，并写入"硬性约束"）：
${instructions}` : ''}`;

export async function generateBrief({ text, report, decisions, chatLog, instructions }) {
  const deepseek = getProviderById('deepseek');
  const raw = await chatOnce(deepseek, [
    { role: 'system', content: '你是翻译项目经理，只输出合法 JSON。' },
    { role: 'user', content: BRIEF_PROMPT(text, report, decisions, chatLog, instructions || '') },
  ], { maxTokens: 4000 });
  return parseJson(raw, '[brief]');
}
