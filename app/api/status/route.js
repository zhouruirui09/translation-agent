import { NextResponse } from 'next/server';
import { listProviders } from '../../../lib/providers';

// 告诉前端当前哪些模型已配置，没配置时走 mock
export async function GET() {
  const providers = listProviders();
  return NextResponse.json({
    mode: providers.every((p) => p.mock) ? 'mock' : 'live',
    providers: providers.map((p) => ({ id: p.id, label: p.label, mock: !!p.mock })),
  });
}
