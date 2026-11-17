import { NextResponse } from 'next/server';
import { saveTranslation } from '../../../../lib/db.js';

export async function POST(request) {
  try {
    const rec = await request.json();
    const id = saveTranslation(rec);
    return NextResponse.json({ id });
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 500 });
  }
}
