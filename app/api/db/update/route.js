import { NextResponse } from 'next/server';
import { updateTranslationFinal, updateTranslationQe, getTranslation } from '../../../../lib/db.js';
import { runRuleChecks } from '../../../../lib/qe_rules.js';
import { assessQuality } from '../../../../lib/qe_judge.js';

export const maxDuration = 600;

export async function POST(request) {
  try {
    const { id, final, reEval, judgeId } = await request.json();
    if (!Number.isInteger(Number(id))) return NextResponse.json({ error: '缺少 id' }, { status: 400 });
    const ok = updateTranslationFinal(id, final);
    if (!ok) return NextResponse.json({ error: '记录不存在' }, { status: 404 });
    if (!reEval) return NextResponse.json({ updated: Number(id) });

    const rec = getTranslation(id);
    const segments = rec.segments || [];
    if (!segments.length || segments.length !== rec.final.length) {
      return NextResponse.json({ updated: Number(id), evalError: '本记录缺少逐句对齐数据，无法重评（可先在上方保存修改）' });
    }
    const rules = runRuleChecks({ segments, final: rec.final, brief: rec.brief || '' });
    const judge = await assessQuality({
      segments,
      final: rec.final,
      brief: rec.brief || '',
      textType: rec.text_type || '',
      judgeId: judgeId || 'deepseek',
      ruleSummary: { counts: rules.counts, glossarySize: rules.glossarySize },
    });
    updateTranslationQe(id, { rules, judge });
    return NextResponse.json({ updated: Number(id), qe_total: judge.weighted_total });
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 500 });
  }
}
