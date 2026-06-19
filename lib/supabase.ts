// lib/supabase.ts
// Supabase 클라이언트 (브라우저). PC·모바일 어디서든 동일 데이터 접근.
//
// 환경변수 (.env.local):
//   NEXT_PUBLIC_SUPABASE_URL=...
//   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
// anon 키는 공개되어도 안전하다. 실제 보호는 RLS(본인 데이터만)가 담당한다.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase: SupabaseClient = isSupabaseConfigured ? createClient(url!, anonKey!, {
  auth: {
    persistSession: true,      // 세션 유지 (재방문 시 자동 로그인)
    autoRefreshToken: true,
    detectSessionInUrl: true,  // 매직링크/OAuth 콜백 처리
  },
}) : (null as unknown as SupabaseClient);
