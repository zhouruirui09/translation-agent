import { NextResponse } from 'next/server';
import { answerQuestion } from '../../../lib/brief';

export const maxDuration = 60;

export async function POST(request) {
  const { text, report, question, history } = await request.json();
  if (!question || !question.trim()) {
    return NextResponse.json({ error: '问题为空' }, { status: 400 });
  }
  try {
    const answer = await answerQuestion({ text: text || '', report: report || {}, question, history });
    return NextResponse.json({ answer });
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 500 });
  }
}
