// 구현 단계에서는 이메일 로그인을 막고 로컬 저장소로 앱 흐름을 검증한다.
// Supabase 인증을 다시 켜려면 .env.local에 NEXT_PUBLIC_IMPLEMENTATION_MODE=false를 둔다.

export const isImplementationMode = process.env.NEXT_PUBLIC_IMPLEMENTATION_MODE !== 'false';
