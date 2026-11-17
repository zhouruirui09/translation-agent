import { NextResponse } from 'next/server';
import { buildResearchReport } from '../../../lib/research';

export const maxDuration = 300;

export async function POST(request) {
  const { text, instructions } = await request.json();
  if (!text || !text.trim()) {
    return NextResponse.json({ error: '文本为空' }, { status: 400 });
  }
  try {
    const out = await buildResearchReport(text, instructions || '');
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 500 });
  }
}
