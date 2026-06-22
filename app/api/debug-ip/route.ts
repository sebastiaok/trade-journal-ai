// 임시: Vercel 서버의 outgoing IP 확인용 (디버깅 후 삭제)
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const res = await fetch('https://api.ipify.org?format=json');
    const data = await res.json() as { ip: string };
    return NextResponse.json({ outgoingIp: data.ip, region: process.env.VERCEL_REGION || 'unknown' });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 500 });
  }
}
