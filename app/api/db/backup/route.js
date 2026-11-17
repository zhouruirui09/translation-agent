import { NextResponse } from 'next/server';
import { readFileSync } from 'node:fs';
import path from 'node:path';

export async function GET() {
  try {
    const file = path.join(process.cwd(), 'data', 'translations.db');
    const buf = readFileSync(file);
    const d = new Date();
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return new NextResponse(buf, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="translations-backup-${day}.db"`,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: `备份失败：${String(e.message || e)}` }, { status: 500 });
  }
}
