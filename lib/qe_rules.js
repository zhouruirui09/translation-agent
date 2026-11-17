// Phase 4 规则校验：不依赖模型的确定性检查。
// 四类硬伤：英文残留 / brief 术语合规 / 数字覆盖 / 完整性（空句）。
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// 去掉译法里的批注括注（暂译/暂音译/功能译法/本句…），规则匹配只核对译名本体
function stripNotes(t) {
  return t.replace(/（[^（）]*）/g, '').replace(/\([^()]*\)/g, '').trim();
}

// 从 brief 的 markdown 表格解析术语对：| 英文 | 中文 |（跳过表头与分隔行）
export function parseBriefGlossary(brief = '') {
  const entries = [];
  for (const line of String(brief).split('\n')) {
    const m = line.match(/^\s*\|([^|]+)\|([^|]+)\|/);
    if (!m) continue;
    const en = m[1].trim();
    const zh = m[2].trim();
    if (!en || !zh || en === '英文' || zh === '中文' || /^[-:\s]+$/.test(en)) continue;
    const enAlts = en.split(/\s*[/／]\s*/).filter(Boolean);
    const keepEn = /保留原文|不强译/.test(zh);
    // 中文栏可能用 / 或 ；;/ 并列多个合法译法（如 "里德宅/里德岛；意象译法可作苇宅/苇岛"），都要拆开当备选
    const zhAlts = keepEn
      ? []
      : [...new Set(zh.split(/\s*[/／；;]\s*/).map(stripNotes).map((t) => t.replace(/["“”‘’]/g, '')).filter((t) => t && !/^[A-Za-z]/.test(t)))];
    entries.push({ enAlts, zhAlts, zhRaw: zh, keepEn });
  }
  return entries;
}

export function runRuleChecks({ segments = [], final = [], brief = '' }) {
  const glossary = parseBriefGlossary(brief);
  // brief 中文栏里本身是英文的（如 "AI（保留原文）"）或注明"保留原文"的术语，视为允许保留的原文 token
  const keepAscii = new Set();
  for (const g of glossary) {
    for (const t of g.zhRaw.match(/[A-Za-z][A-Za-z.'&-]{1,}/g) || []) keepAscii.add(t.toLowerCase());
    if (g.keepEn) for (const t of g.enAlts) keepAscii.add(t.toLowerCase());
  }
  const issues = [];
  const zhNum = /[〇零一二两三四五六七八九十百千万亿]/;

  segments.forEach((en, i) => {
    const n = i + 1;
    const zh = (final[i] || '').trim();

    if (!zh) {
      issues.push({ n, kind: 'missing', detail: '定稿此句为空（漏译）' });
      return;
    }

    // 1. 英文残留（≥2 字母的词，连字符/撇号词算一个；brief 允许保留的除外）
    const residue = (zh.match(/[A-Za-z][A-Za-z.'&-]{1,}/g) || []).filter((t) => !keepAscii.has(t.toLowerCase()));
    if (residue.length) {
      issues.push({ n, kind: 'english', detail: `残留英文：${residue.slice(0, 5).join('、')}` });
    }

    // 2. 数字覆盖：原文有阿拉伯数字，译文既无阿拉伯数字也无中文数字 → 疑似漏数字
    const enNums = en.match(/\d[\d,.]*/g);
    if (enNums && !/\d/.test(zh) && !zhNum.test(zh)) {
      issues.push({ n, kind: 'number', detail: `原文数字 ${enNums.join('、')} 在译文中未见对应（请人工核对）` });
    }

    // 3. 术语合规：原文命中 brief 术语，译文未含任何指定译法
    for (const g of glossary) {
      if (!g.zhAlts.length) continue; // brief 指定保留原文的术语不检查
      const hit = g.enAlts.some(alt =>
        new RegExp(`\\b${escapeRegex(alt)}\\b`, 'i').test(en));
      if (hit && !g.zhAlts.some(alt => zh.includes(alt))) {
        issues.push({ n, kind: 'term', detail: `「${g.enAlts[0]}」应译作「${g.zhRaw}」，定稿未见对应译法` });
      }
    }
  });

  const counts = {};
  for (const it of issues) counts[it.kind] = (counts[it.kind] || 0) + 1;
  return { issues, counts, glossarySize: glossary.length, sentences: segments.length };
}
