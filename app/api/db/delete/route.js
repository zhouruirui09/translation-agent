import { NextResponse } from 'next/server';
import { deleteTranslation } from '../../../../lib/db.js';

export async function POST(request) {
  try {
    const { id } = await request.json();
    if (!Number.isInteger(Number(id))) return NextResponse.json({ error: '缺少 id' }, { status: 400 });
    const ok = deleteTranslation(id);
    if (!ok) return NextResponse.json({ error: '记录不存在' }, { status: 404 });
    return NextResponse.json({ deleted: Number(id) });
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 500 });
  }
}
