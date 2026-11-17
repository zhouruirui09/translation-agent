import { NextResponse } from 'next/server';
import { runRuleChecks } from '../../../lib/qe_rules.js';
import { assessQuality } from '../../../lib/qe_judge.js';

export const maxDuration = 600;

export async function POST(request) {
  try {
    const { segments, final, brief, textType, judgeId } = await request.json();
    if (!Array.isArray(segments) || !Array.isArray(final) || segments.length !== final.length) {
      return NextResponse.json({ error: 'segments 与 final 必须为等长数组' }, { status: 400 });
    }
    const rules = runRuleChecks({ segments, final, brief: brief || '' });
    const judge = await assessQuality({
      segments,
      final,
      brief: brief || '',
      textType: textType || '',
      judgeId: judgeId || 'deepseek',
      ruleSummary: { counts: rules.counts, glossarySize: rules.glossarySize },
    });
    return NextResponse.json({ rules, judge });
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 500 });
  }
}
