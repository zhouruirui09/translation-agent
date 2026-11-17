// 英文句级切分：先按段落，再按句子。Phase 1 使用规则切分，足够对齐用。

export function segmentText(text) {
  return segmentWithParagraphs(text).segments;
}

// starts[i] = 第 i 段的起始句在 segments 中的下标，供"按段交替"等导出排版还原段落
export function segmentWithParagraphs(text) {
  const paragraphs = text
    .split(/\n\s*\n+/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const segments = [];
  const starts = [];
  for (const para of paragraphs) {
    starts.push(segments.length);
    for (const sent of splitSentences(para)) segments.push(sent);
  }
  return { segments, starts };
}

const ABBREVIATIONS = /\b(Mr|Mrs|Ms|Dr|Prof|St|vs|etc|e\.g|i\.e|Inc|Ltd|U\.S|U\.K|approx|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.$/i;

function splitSentences(para) {
  const parts = para.split(/(?<=[.!?])\s+(?=[A-Z"'\u201C])/);
  const out = [];
  let buf = '';
  for (const part of parts) {
    buf = buf ? `${buf} ${part}` : part;
    if (ABBREVIATIONS.test(buf.trim())) continue; // 缩写结尾，继续拼接下一块
    out.push(buf.trim());
    buf = '';
  }
  if (buf.trim()) {
    if (out.length) out[out.length - 1] += ' ' + buf.trim();
    else out.push(buf.trim());
  }
  return out.filter(Boolean);
}
