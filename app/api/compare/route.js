import { NextResponse } from 'next/server';
import { compareTranslations } from '../../../lib/compare.js';

export const maxDuration = 600;

export async function POST(request) {
  try {
    const { segments, results, brief, judgeId } = await request.json();
    if (!Array.isArray(segments) || !Array.isArray(results)) {
      return NextResponse.json({ error: '缺少 segments 或 results 参数' }, { status: 400 });
    }
    const out = await compareTranslations({ segments, results, brief: brief || '', judgeId: judgeId || 'deepseek' });
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 500 });
  }
}
