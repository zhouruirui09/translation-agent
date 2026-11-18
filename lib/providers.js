// 英译汉 agent 的模型接入层：统一 OpenAI 兼容协议，配置驱动，可插拔。
// 新增一个模型只需在 PROVIDERS 加一条 + .env 填 key，零代码改动。
import { netFetch, describeFetchError } from './net.js';

const PROVIDERS = [
  {
    id: 'deepseek',
    envPrefix: 'DEEPSEEK',
    label: 'DeepSeek',
    defaultBaseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
  },
  {
    id: 'kimi',
    envPrefix: 'MOONSHOT',
    label: 'Kimi',
    defaultBaseUrl: 'https://api.moonshot.cn/v1',
    defaultModel: 'kimi-k3.1-pro',
  },
  {
    id: 'doubao',
    envPrefix: 'DOUBAO',
    label: '豆包',
    defaultBaseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    defaultModel: '',
  },
];

// 演示模式给 3 个模拟版本，保证 ③→④ 的多版比较环节也能演示
const MOCK_PROVIDERS = ['甲', '乙', '丙'].map((t) => ({ id: `mock-${t}`, label: `模拟${t}版`, mock: true }));

function buildProvider(def) {
  const env = (suffix, fallback = '') => process.env[`${def.envPrefix}_${suffix}`] ?? fallback;
  return {
    id: def.id,
    label: def.label,
    baseUrl: () => env('BASE_URL', def.defaultBaseUrl),
    apiKey: () => env('API_KEY'),
    model: () => env('MODEL', def.defaultModel),
    // kimi-k3 等模型只接受 temperature=1，用 <PREFIX>_TEMPERATURE 覆盖（钉死后调用方传参也不生效）
    temperature: () => Number(env('TEMPERATURE', '0.7')),
    pinnedTemperature: () => (env('TEMPERATURE') ? Number(env('TEMPERATURE')) : null),
    isConfigured: () => Boolean(env('API_KEY') && env('MODEL', def.defaultModel)),
  };
}

export function allProviderDefs() {
  return PROVIDERS.map(buildProvider);
}

export function getProviderById(id) {
  return allProviderDefs().find((p) => p.id === id) || null;
}

export function listProviders() {
  const configured = allProviderDefs().filter((p) => p.isConfigured());
  if (configured.length === 0) return MOCK_PROVIDERS;
  return configured;
}

// 演示模式判定：一个 key 都没配时，①②④⑤ 等所有模型环节统一走 lib/mock.js 的模拟数据
export function isMockMode() {
  return allProviderDefs().every((p) => !p.isConfigured());
}

export async function chatOnce(p, messages, { temperature, maxTokens } = {}) {
  let res;
  try {
    res = await netFetch(`${p.baseUrl()}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${p.apiKey()}`,
      },
      body: JSON.stringify({
        model: p.model(),
        temperature: p.pinnedTemperature() ?? temperature ?? p.temperature(),
        ...(maxTokens ? { max_tokens: maxTokens } : {}),
        messages,
      }),
    });
  } catch (e) {
    throw describeFetchError(p.label, e);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${p.label} API ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '';
}

const SYSTEM_PROMPT =
  '你是一名专业的英译汉译者。用户会给你一段带编号的英文分句列表。' +
  '请逐句翻译成中文，严格按相同编号输出，每行格式为「编号\t译文」。' +
  '不要遗漏、合并或改变编号，除译文行外不要输出任何解释。';

// 按盲测结论给不同模型加针对性约束（DeepSeek：英文残留/术语一致性硬伤）
const PROVIDER_CONSTRAINTS = {
  deepseek: '额外硬性要求：输出必须全部为中文，严禁保留未翻译的英文单词（brief 术语表指定保留原文的除外）；人名地名机构名严格按 brief 术语表执行；数字、日期、货币单位必须与原文逐一核对。',
};

export async function translateSegments(p, segments, brief = '') {
  if (p.mock) {
    return segments.map((s, i) => `${i + 1}\t【${p.label} ${i + 1}】${s}`);
  }
  const numbered = segments.map((s, i) => `${i + 1}\t${s}`).join('\n');
  let system = SYSTEM_PROMPT;
  if (brief) system += `\n\n本次翻译必须严格遵守以下翻译指令（translation brief）：\n${brief}`;
  if (PROVIDER_CONSTRAINTS[p.id]) system += `\n${PROVIDER_CONSTRAINTS[p.id]}`;
  const raw = await chatOnce(p, [
    { role: 'system', content: system },
    { role: 'user', content: numbered },
  ]);
  return parseAligned(raw, segments.length);
}

function parseAligned(raw, count) {
  const map = new Map();
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*(\d+)[\t.、)\s]+\s*(.+)$/);
    if (m) map.set(Number(m[1]), m[2].trim());
  }
  const out = [];
  for (let i = 1; i <= count; i++) {
    out.push(map.get(i) ?? `[第 ${i} 句解析失败]`);
  }
  return out;
}
