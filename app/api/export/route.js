import { NextResponse } from 'next/server';
import { buildBlocks, buildMarkdown, buildDocx } from '../../../lib/export.js';

export const maxDuration = 60;

export async function POST(request) {
  try {
    const { segments, final, source_text, mode = 'translation', format = 'md', title } = await request.json();
    if (!Array.isArray(segments) || !segments.length) return NextResponse.json({ error: '缺少 segments' }, { status: 400 });
    if (!Array.isArray(final) || final.length !== segments.length) {
      return NextResponse.json({ error: 'final 必须与 segments 句数一致' }, { status: 400 });
    }
    const name = String(title || '译文导出').slice(0, 60);
    const blocks = buildBlocks(segments, final, mode, source_text || '');

    if (format === 'docx') {
      const buf = await buildDocx(name, blocks);
      const fname = encodeURIComponent(`${name}.docx`);
      return new NextResponse(buf, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'Content-Disposition': `attachment; filename*=UTF-8''${fname}`,
        },
      });
    }
    const md = buildMarkdown(name, blocks);
    const fname = encodeURIComponent(`${name}.md`);
    return new NextResponse(md, {
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': `attachment; filename*=UTF-8''${fname}`,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 500 });
  }
}
