import { NextResponse } from 'next/server';
import { getJob } from '../../../../lib/jobs';

export async function GET(request) {
  const id = new URL(request.url).searchParams.get('id');
  const job = id ? getJob(String(id)) : null;
  return NextResponse.json(job || { startedAt: null, providers: {} });
}
