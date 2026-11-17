// 定稿导出：segments(英文句)+final(中文句) → Markdown 或 Word。
// 内容模式：translation 纯译文 | line 逐句对照 | table 表格式对照 | para 按段交替对照。
// 段落还原依赖 segmentWithParagraphs；若 segments 与原文重新切分不一致（如导入译文场景），按段模式自动退化。
import { segmentWithParagraphs } from './segmenter.js';
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, AlignmentType, BorderStyle,
} from 'docx';

export const MODE_LABELS = {
  translation: '纯译文',
  line: '逐句对照',
  table: '表格式对照',
  para: '按段交替对照',
};

// 返回 [{enStart,enEnd}] 段落区间（按句下标），无法还原时返回 null
function paragraphRanges(sourceText, segments) {
  if (!sourceText) return null;
  try {
    const { segments: ss, starts } = segmentWithParagraphs(sourceText);
    if (ss.length !== segments.length) return null;
    for (let i = 0; i < ss.length; i++) {
      if (ss[i] !== segments[i]) return null;
    }
    const ranges = [];
    for (let i = 0; i < starts.length; i++) {
      ranges.push([starts[i], i + 1 < starts.length ? starts[i + 1] : ss.length]);
    }
    return ranges;
  } catch {
    return null;
  }
}

// 统一转成块序列 {type:'para',en,zh} | {type:'table-row',en,zh}，两种格式共用
export function buildBlocks(segments, final, mode, sourceText) {
  const n = segments.length;
  const getZh = (i) => (final[i] || '').trim();
  if (mode === 'translation') {
    const ranges = paragraphRanges(sourceText, segments);
    if (ranges) return ranges.map(([a, b]) => ({ type: 'para', zh: segments.slice(a, b).map((_, j) => getZh(a + j)).join('') }));
    return segments.map((_, i) => ({ type: 'para', zh: getZh(i) })).filter((p) => p.zh);
  }
  if (mode === 'line') {
    const out = [];
    for (let i = 0; i < n; i++) out.push({ type: 'para', en: segments[i], zh: getZh(i) });
    return out;
  }
  if (mode === 'table') {
    const out = [{ type: 'table-row', en: '英文原文', zh: '中文译文', header: true }];
    for (let i = 0; i < n; i++) out.push({ type: 'table-row', en: segments[i], zh: getZh(i) });
    return out;
  }
  if (mode === 'para') {
    const ranges = paragraphRanges(sourceText, segments);
    if (!ranges) {
      const out = [];
      for (let i = 0; i < n; i++) out.push({ type: 'para', en: segments[i] }, { type: 'para', zh: getZh(i) });
      return out;
    }
    const out = [];
    for (const [a, b] of ranges) {
      out.push({ type: 'para', en: segments.slice(a, b).join(' ') });
      out.push({ type: 'para', zh: segments.slice(a, b).map((_, j) => getZh(a + j)).join('') });
    }
    return out;
  }
  throw new Error(`未知导出模式: ${mode}`);
}

const esc = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');

export function buildMarkdown(title, blocks) {
  const lines = [`# ${title}`, ''];
  for (const b of blocks) {
    if (b.type === 'table-row') {
      if (b.header) { lines.push(`| ${esc(b.en)} | ${esc(b.zh)} |`, '| --- | --- |'); }
      else lines.push(`| ${esc(b.en)} | ${esc(b.zh)} |`);
    } else {
      if (b.en) lines.push(b.en, '');
      if (b.zh) lines.push(b.zh, '');
    }
  }
  return lines.join('\n');
}

const cellPara = (text, bold) => new Paragraph({ children: [new TextRun({ text, bold })] });

export async function buildDocx(title, blocks) {
  const children = [
    new Paragraph({ text: title, heading: 'Heading1', spacing: { after: 240 } }),
  ];
  let tableRows = null;
  const flushTable = () => {
    if (tableRows && tableRows.length) {
      children.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: {
          top: { style: BorderStyle.SINGLE, size: 4 }, bottom: { style: BorderStyle.SINGLE, size: 4 },
          left: { style: BorderStyle.SINGLE, size: 4 }, right: { style: BorderStyle.SINGLE, size: 4 },
          insideHorizontal: { style: BorderStyle.SINGLE, size: 4 }, insideVertical: { style: BorderStyle.SINGLE, size: 4 },
        },
        rows: tableRows,
      }));
    }
    tableRows = null;
  };
  for (const b of blocks) {
    if (b.type === 'table-row') {
      if (!tableRows) tableRows = [];
      tableRows.push(new TableRow({
        children: [
          new TableCell({ children: [cellPara(b.en, !!b.header)], width: { size: 50, type: WidthType.PERCENTAGE } }),
          new TableCell({ children: [cellPara(b.zh, !!b.header)], width: { size: 50, type: WidthType.PERCENTAGE } }),
        ],
      }));
    } else {
      flushTable();
      if (b.en) children.push(new Paragraph({ children: [new TextRun({ text: b.en, italics: true, color: '6B7280' })], spacing: { after: 60 } }));
      if (b.zh) children.push(new Paragraph({ children: [new TextRun(b.zh)], spacing: { after: 180 } }));
    }
  }
  flushTable();
  const doc = new Document({
    styles: { default: { document: { run: { font: 'SimSun', size: 24 } } } },
    sections: [{ children }],
  });
  return Packer.toBuffer(doc);
}
