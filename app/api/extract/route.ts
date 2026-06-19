// app/api/extract/route.ts
// 비전 인식 서버 라우트 — 이미지를 받아 Anthropic으로 거래 항목을 추출한다.
// Anthropic 키를 클라이언트에 노출하지 않기 위해 서버에서만 호출한다.
//
// 환경변수: ANTHROPIC_API_KEY (서버 전용, NEXT_PUBLIC_ 접두사 없음)
// 요청 본문: { imageBase64: string, mediaType: string, prompt: string }
// 응답:     { raw: string }  (모델 원문. 파싱은 클라이언트 visionExtract에서)

import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

interface Body {
  imageBase64?: string;
  mediaType?: string;
  prompt?: string;
}

export async function POST(req: Request) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY가 설정되지 않았습니다.' }, { status: 500 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: '잘못된 요청 본문입니다.' }, { status: 400 });
  }

  const { imageBase64, mediaType, prompt } = body;
  if (!imageBase64 || !mediaType || !prompt) {
    return NextResponse.json({ error: 'imageBase64/mediaType/prompt가 필요합니다.' }, { status: 400 });
  }

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
              { type: 'text', text: prompt },
            ],
          },
        ],
      }),
    });

    if (!resp.ok) {
      const detail = await resp.text();
      return NextResponse.json({ error: `Anthropic 오류: ${resp.status}`, detail }, { status: 502 });
    }

    const json = (await resp.json()) as { content?: { type: string; text?: string }[] };
    const raw = (json.content ?? [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text ?? '')
      .join('\n');

    return NextResponse.json({ raw });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '인식 요청에 실패했습니다.' },
      { status: 500 },
    );
  }
}
