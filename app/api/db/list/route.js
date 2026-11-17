import { NextResponse } from 'next/server';
import { listTranslations } from '../../../../lib/db.js';

export async function GET() {
  try {
    return NextResponse.json({ items: listTranslations() });
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 500 });
  }
}
