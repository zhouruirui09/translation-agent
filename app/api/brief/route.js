import { NextResponse } from 'next/server';
import { generateBrief } from '../../../lib/brief';

export const maxDuration = 120;

export async function POST(request) {
  const { text, report, decisions, chatLog, instructions } = await request.json();
  try {
    const out = await generateBrief({ text: text || '', report: report || {}, decisions: decisions || {}, chatLog: chatLog || '', instructions: instructions || '' });
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 500 });
  }
}
