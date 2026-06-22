// lib/supabaseServer.ts
// 서버 API Route 전용 Supabase 클라이언트 — 요청 Authorization 헤더로 사용자 인증

import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * Authorization 헤더의 Bearer 토큰으로 인증된 사용자 ID를 반환.
 * 실패 시 null.
 */
export async function getServerUser(req: Request): Promise<string | null> {
  const auth = req.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) {
    console.error('[getServerUser] No Authorization header or not Bearer. Header:', auth?.slice(0, 20) ?? 'null');
    return null;
  }

  const token = auth.slice(7);
  if (!token || token.length < 10) {
    console.error('[getServerUser] Token too short or empty, length:', token.length);
    return null;
  }

  const client = createClient(url, serviceKey);
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) {
    console.error('[getServerUser] getUser failed:', error?.message ?? 'no user', 'tokenPrefix:', token.slice(0, 20));
    return null;
  }
  return data.user.id;
}

/**
 * Service Role 클라이언트 (RLS 우회) — 서버에서만 사용.
 */
export function getAdminClient() {
  return createClient(url, serviceKey);
}
