// 探测 Kimi / 豆包的联网检索 API 格式
// node --env-file=.env.local scripts/probe-websearch.mjs kimi
import { getProviderById } from '../lib/providers.js';

const Q = 'Jane Austen Pride and Prejudice 1813 出版背景 作者生平';

async function probeKimi(p) {
  const url = `${p.baseUrl()}/chat/completions`;
  // Moonshot builtin web search tool
  const body = {
    model: p.model(),
    temperature: 1,
    messages: [{ role: 'user', content: `请联网检索并回答：${Q}` }],
    tools: [{ type: 'builtin', id: '$web_search' }],
  };
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p.apiKey()}` },
    body: JSON.stringify(body),
  });
  console.log('HTTP', r.status);
  const data = await r.json();
  if (data.error) { console.log('ERROR:', JSON.stringify(data.error)); return; }
  const msg = data.choices?.[0]?.message;
  console.log('content len:', (msg?.content || '').length);
  console.log('tool_calls:', msg?.tool_calls?.map((t) => t.function?.name));
  console.log('--- content head ---\n', (msg?.content || '').slice(0, 500));
}

async function probeDoubao(p) {
  const url = `${p.baseUrl()}/chat/completions`;
  const body = {
    model: p.model(),
    temperature: 0.7,
    messages: [{ role: 'user', content: `请联网检索并回答：${Q}` }],
    tools: [{ type: 'web_search' }],
    thinking: { type: 'disabled' },
  };
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p.apiKey()}` },
    body: JSON.stringify(body),
  });
  console.log('HTTP', r.status);
  const data = await r.json();
  if (data.error) { console.log('ERROR:', JSON.stringify(data.error)); return; }
  const msg = data.choices?.[0]?.message;
  console.log('content len:', (msg?.content || '').length);
  console.log('--- content head ---\n', (msg?.content || '').slice(0, 500));
}

const p = getProviderById(process.argv[2] || 'kimi');
console.log('probing', p.id, p.model());
if (p.id === 'kimi') await probeKimi(p);
else if (p.id === 'doubao') await probeDoubao(p);
