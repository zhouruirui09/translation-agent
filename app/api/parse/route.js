import { NextResponse } from 'next/server';
import { parseDocument } from '../../../lib/parse';

export const maxDuration = 120;

export async function POST(request) {
  try {
    const form = await request.formData();
    const file = form.get('file');
    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: '未收到文件' }, { status: 400 });
    }
    if (file.size > 20 * 1024 * 1024) {
      return NextResponse.json({ error: '文件超过 20MB' }, { status: 400 });
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const text = await parseDocument(file.name || '', buffer);
    if (!text.trim()) {
      return NextResponse.json({ error: '没有解析出文本内容（扫描版/图片型 PDF 暂不支持）' }, { status: 422 });
    }
    return NextResponse.json({ text, chars: text.length, filename: file.name || '' });
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 500 });
  }
}
