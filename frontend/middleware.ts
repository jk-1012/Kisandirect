import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'kisandirect.in';
const IGNORED_HOSTS = ['localhost', '127.0.0.1'];

export function middleware(request: NextRequest) {
  const host = request.headers.get('host') ?? '';
  const hostOnly = host.split(':')[0];
  const url = request.nextUrl.clone();

  if (IGNORED_HOSTS.some((ignored) => hostOnly === ignored)) {
    return NextResponse.next();
  }

  if (!hostOnly.endsWith(ROOT_DOMAIN)) {
    return NextResponse.next();
  }

  const [subdomain] = hostOnly.split('.');
  const isRoot = subdomain === 'www' || subdomain === 'kisandirect' || subdomain === ROOT_DOMAIN;
  const isApiOrAsset = url.pathname.startsWith('/api') || url.pathname.startsWith('/_next') || url.pathname.startsWith('/static') || url.pathname === '/favicon.ico';

  if (!isRoot && !isApiOrAsset) {
    url.pathname = `/__store/${subdomain}${url.pathname}`;
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/((?!api|_next|static|favicon\.ico).*)']
};
