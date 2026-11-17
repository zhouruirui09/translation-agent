import { NextResponse } from 'next/server';
import { segmentText } from '../../../lib/segmenter';
import { listProviders, translateSegments } from '../../../lib/providers';
import { startJob } from '../../../lib/jobs';

// 分块：每块最多 20 句且总字符不超预算（长句型文章 20 句可能远超单请求舒适区）
const SENTENCES_PER_CHUNK = 20;
const CHARS_PER_CHUNK = 3000;
// 并发：每模型同时跑 3 块。串行时 Kimi 5 块≈25 分钟，3 路并发≈2 轮打完
const CHUNK_CONCURRENCY = 3;
// 单块失败后退避重试（429/网络抖动），仍失败则该块填占位、不拖垮整篇
const RETRY_WAITS = [15000, 45000];

export async function POST(request) {
  const { text, brief, providerIds, jobId } = await request.json();
  if (!text || !text.trim()) {
    return NextResponse.json({ error: '文本为空' }, { status: 400 });
  }

  const segments = segmentText(text);
  let providers = listProviders();
  if (Array.isArray(providerIds) && providerIds.length) {
    providers = providers.filter((p) => providerIds.includes(p.id));
  }
  if (!providers.length) {
    return NextResponse.json({ error: '没有选中的可用模型' }, { status: 400 });
  }

  const chunks = makeChunks(segments);
  const job = { startedAt: Date.now(), providers: {} };
  for (const p of providers) {
    job.providers[p.id] = { label: p.label, done: 0, total: chunks.length };
  }
  if (jobId) startJob(String(jobId), job);

  const results = await Promise.all(
    providers.map(async (p) => {
      try {
        const { translations, chunkErrors } = await translateChunked(p, chunks, brief, job.providers[p.id]);
        return { provider: p.id, label: p.label, mock: !!p.mock, error: null, chunkErrors, translations };
      } catch (e) {
        return { provider: p.id, label: p.label, mock: !!p.mock, error: String(e.message || e), chunkErrors: [], translations: null };
      }
    })
  );

  return NextResponse.json({ segments, results, briefApplied: Boolean(brief), chunks: chunks.length });
}

function makeChunks(segments) {
  const chunks = [];
  let start = 0;
  let chars = 0;
  for (let i = 0; i < segments.length; i++) {
    const len = segments[i].length + 1;
    if (i > start && (chars + len > CHARS_PER_CHUNK || i - start >= SENTENCES_PER_CHUNK)) {
      chunks.push({ start, items: segments.slice(start, i) });
      start = i;
      chars = 0;
    }
    chars += len;
  }
  chunks.push({ start, items: segments.slice(start) });
  return chunks;
}

async function translateChunked(p, chunks, brief, prog) {
  const out = new Array(chunks.length);
  const chunkErrors = [];
  let next = 0;
  const worker = async () => {
    for (;;) {
      const ci = next++;
      if (ci >= chunks.length) return;
      const c = chunks[ci];
      let lastErr;
      for (let attempt = 0; attempt <= RETRY_WAITS.length; attempt++) {
        try {
          const t = await translateSegments(p, c.items, brief);
          out[ci] = { start: c.start, translations: t };
          lastErr = null;
          break;
        } catch (e) {
          lastErr = e;
          if (attempt < RETRY_WAITS.length) await sleep(RETRY_WAITS[attempt]);
        }
      }
      if (lastErr) {
        chunkErrors.push(`第${c.start + 1}-${c.start + c.items.length}句：${lastErr.message || lastErr}`);
        out[ci] = { start: c.start, translations: c.items.map((_, i) => `[翻译失败，请人工重译：第${c.start + i + 1}句]`) };
      }
      prog.done++;
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(CHUNK_CONCURRENCY, chunks.length) }, worker)
  );
  const translations = out.flatMap((o) => o.translations.map((t, i) => `${o.start + i + 1}\t${stripIndex(t)}`));
  return { translations, chunkErrors };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function stripIndex(line) {
  const m = line.match(/^\s*\d+[\t.、)\s]+\s*(.*)$/);
  return m ? m[1] : line;
}
