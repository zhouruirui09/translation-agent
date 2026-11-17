import { NextResponse } from 'next/server';
import { searchTranslations } from '../../../../lib/db.js';

export async function GET(request) {
  try {
    const q = new URL(request.url).searchParams.get('q') || '';
    if (!q.trim()) return NextResponse.json({ items: [] });
    return NextResponse.json({ items: searchTranslations(q.trim()) });
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 500 });
  }
}
