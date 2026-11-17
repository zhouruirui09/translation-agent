// 译文数据库：Node 内置 SQLite（node:sqlite），文件在 data/translations.db。
// 每条记录 = 一次完整翻译任务：原文/定稿全文 + 逐句对齐 JSON + brief + 背景报告 + 整合意见 + 质检报告。
// 检索用 LIKE 子串匹配（SQLite 默认 FTS 分词器不支持中文分词，个人库规模下 LIKE 足够且结果确定）。
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const DB_PATH = path.join(process.cwd(), 'data', 'translations.db');

let db = null;

function getDb() {
  if (!db) {
    mkdirSync(path.dirname(DB_PATH), { recursive: true });
    db = new DatabaseSync(DB_PATH);
    db.exec(`
      CREATE TABLE IF NOT EXISTS translations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
        text_type TEXT DEFAULT '',
        models TEXT DEFAULT '',
        source_text TEXT NOT NULL,
        target_text TEXT NOT NULL,
        segments_json TEXT DEFAULT '[]',
        final_json TEXT DEFAULT '[]',
        brief TEXT DEFAULT '',
        report_json TEXT DEFAULT '',
        compare_json TEXT DEFAULT '',
        qe_json TEXT DEFAULT '',
        qe_total INTEGER
      )
    `);
    const cols = db.prepare('PRAGMA table_info(translations)').all().map((c) => c.name);
    if (!cols.includes('parent_id')) db.exec('ALTER TABLE translations ADD COLUMN parent_id INTEGER');
  }
  return db;
}

export function saveTranslation(rec) {
  if (!rec.source_text || !Array.isArray(rec.final) || !rec.final.length) {
    throw new Error('入库需要 source_text 与 final 数组');
  }
  const stmt = getDb().prepare(`
    INSERT INTO translations
      (text_type, models, source_text, target_text, segments_json, final_json,
       brief, report_json, compare_json, qe_json, qe_total, parent_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
  `);
  const r = stmt.run(
    rec.textType || '',
    rec.models || '',
    rec.source_text,
    rec.final.join('\n'),
    JSON.stringify(rec.segments || []),
    JSON.stringify(rec.final),
    rec.brief || '',
    rec.report ? JSON.stringify(rec.report) : '',
    rec.compare ? JSON.stringify(rec.compare) : '',
    rec.qe ? JSON.stringify(rec.qe) : '',
    rec.qe?.judge?.weighted_total ?? null,
    Number.isInteger(rec.parent_id) ? rec.parent_id : null
  );
  return Number(r.lastInsertRowid);
}

const LIST_SQL = `
  SELECT id, created_at, text_type, models, qe_total, parent_id,
         substr(source_text, 1, 60) AS source_preview,
         substr(target_text, 1, 60) AS target_preview
  FROM translations
`;

export function listTranslations() {
  return getDb().prepare(`${LIST_SQL} ORDER BY id DESC`).all();
}

export function searchTranslations(q) {
  const like = `%${String(q).replace(/[%_]/g, '')}%`;
  return getDb()
    .prepare(`${LIST_SQL} WHERE lower(source_text) LIKE lower(?) OR target_text LIKE ? ORDER BY id DESC LIMIT 50`)
    .all(like, like);
}

export function getTranslation(id) {
  const row = getDb().prepare('SELECT * FROM translations WHERE id = ?').get(Number(id));
  if (!row) return null;
  const j = (s) => {
    try { return s ? JSON.parse(s) : null; } catch { return null; }
  };
  return {
    ...row,
    segments: j(row.segments_json) || [],
    final: j(row.final_json) || [],
    report: j(row.report_json),
    compare: j(row.compare_json),
    qe: j(row.qe_json),
  };
}

export function deleteTranslation(id) {
  const r = getDb().prepare('DELETE FROM translations WHERE id = ?').run(Number(id));
  return Number(r.changes) > 0;
}

// 只更新定稿文本（final_json + 拼出的 target_text）；评估报告保持原样，作为入库时点的历史快照
export function updateTranslationFinal(id, finalArr) {
  if (!Array.isArray(finalArr) || !finalArr.length) throw new Error('final 必须是非空数组');
  const r = getDb()
    .prepare('UPDATE translations SET final_json = ?, target_text = ? WHERE id = ?')
    .run(JSON.stringify(finalArr), finalArr.join('\n'), Number(id));
  return Number(r.changes) > 0;
}

// 重评后刷新本条记录的质检报告与总分（覆盖旧快照）
export function updateTranslationQe(id, qeObj) {
  if (!qeObj) throw new Error('缺少评估结果');
  const r = getDb()
    .prepare('UPDATE translations SET qe_json = ?, qe_total = ? WHERE id = ?')
    .run(JSON.stringify(qeObj), qeObj.judge?.weighted_total ?? null, Number(id));
  return Number(r.changes) > 0;
}
