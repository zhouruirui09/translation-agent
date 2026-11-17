import { NextResponse } from 'next/server';
import { getTranslation } from '../../../../lib/db.js';

export async function GET(request) {
  try {
    const id = new URL(request.url).searchParams.get('id');
    const rec = getTranslation(id);
    if (!rec) return NextResponse.json({ error: '记录不存在' }, { status: 404 });
    return NextResponse.json(rec);
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 500 });
  }
}
