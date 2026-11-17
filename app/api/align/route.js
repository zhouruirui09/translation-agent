import { NextResponse } from 'next/server';
import { alignTranslation } from '../../../lib/align';

export const maxDuration = 300;

export async function POST(request) {
  try {
    const { sourceText, targetText, judgeId } = await request.json();
    if (!sourceText || !sourceText.trim() || !targetText || !targetText.trim()) {
      return NextResponse.json({ error: '请同时提供英文原文和中文译文' }, { status: 400 });
    }
    const out = await alignTranslation({ sourceText, targetText, judgeId });
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 500 });
  }
}
