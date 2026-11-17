// 四类文本的质量评估权重 profile（0-100 五维分加权成总分）
export const QE_PROFILES = {
  literary: { label: '文学/人文', weights: { accuracy: 0.30, fluency: 0.25, style: 0.30, terminology: 0.10, completeness: 0.05 } },
  news: { label: '新闻/时政', weights: { accuracy: 0.35, fluency: 0.25, style: 0.10, terminology: 0.20, completeness: 0.10 } },
  tech: { label: '科技/工程', weights: { accuracy: 0.35, fluency: 0.20, style: 0.05, terminology: 0.30, completeness: 0.10 } },
  legal: { label: '商务/法律', weights: { accuracy: 0.35, fluency: 0.15, style: 0.05, terminology: 0.30, completeness: 0.15 } },
};

export const DIM_LABELS = {
  accuracy: '准确性',
  fluency: '流畅性',
  style: '文体语域',
  terminology: '术语统一',
  completeness: '完整无漏增',
};

export function pickProfile(textType = '') {
  const t = String(textType);
  if (/新闻|时政|报道|通讯/.test(t)) return ['news', QE_PROFILES.news];
  if (/法律|法规|商务|合同|条例|条款/.test(t)) return ['legal', QE_PROFILES.legal];
  if (/科技|技术|工程|科学|IT/.test(t)) return ['tech', QE_PROFILES.tech];
  return ['literary', QE_PROFILES.literary];
}
