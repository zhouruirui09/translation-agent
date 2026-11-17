// Kimi 联网搜索 Pro 封装：POST /v1/tools/search_pro
// 返回结构化结果（标题/链接/站点/日期/相关性排序正文片段），供背景报告使用。
import { getProviderById } from './providers.js';
import { netFetch, describeFetchError } from './net.js';

function kimiAuth() {
  const p = getProviderById('kimi');
  if (!p || !p.apiKey()) throw new Error('Kimi API Key 未配置，无法联网检索');
  return p;
}

export async function webSearchPro(textQuery, { limit = 5, sites, timeWindow } = {}) {
  const p = kimiAuth();
  const body = {
    text_query: textQuery,
    limit,
    timeout_seconds: 30,
    ...(sites ? { sites } : {}),
    ...(timeWindow ? { time_window: timeWindow } : {}),
  };
  let res;
  try {
    res = await netFetch(`${p.baseUrl()}/tools/search_pro`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p.apiKey()}` },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw describeFetchError('Kimi search_pro', e);
  }
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Kimi search_pro ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  return (data.search_results || []).map((r) => ({
    title: r.title,
    url: r.url,
    site: r.site_name,
    date: r.date,
    chunks: (r.chunks || []).map((c) => c.text),
  }));
}

// 把多条检索结果拼成一段带来源的纯文本，喂给模型做报告
export function formatResults(results) {
  return results
    .map((r) => {
      const src = [r.site, r.date].filter(Boolean).join(' · ');
      const body = (r.chunks || []).join('\n');
      return `【${r.title}】(${src})\n链接：${r.url}\n${body}`;
    })
    .join('\n\n---\n\n');
}
