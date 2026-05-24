import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const body = await request.json();
  const { accessToken, refreshToken } = body as { accessToken?: string; refreshToken?: string };

  if (!accessToken || !refreshToken) {
    return NextResponse.json({ error: 'Missing tokens' }, { status: 400 });
  }

  const response = NextResponse.json({ success: true });
  const secure = process.env.NODE_ENV === 'production';

  response.cookies.set('kd_session', accessToken, {
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    secure,
    maxAge: 60 * 15
  });

  response.cookies.set('kd_refresh_token', refreshToken, {
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    secure,
    maxAge: 30 * 24 * 60 * 60
  });

  return response;
}
