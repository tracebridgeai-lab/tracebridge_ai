import { NextRequest, NextResponse } from 'next/server';

// Site-wide basic auth gate.
// Credentials come from environment variables (set them in Vercel → Project → Settings → Environment Variables):
//   SITE_AUTH_USER
//   SITE_AUTH_PASSWORD
// If either is missing, the site stays locked rather than open.
export function middleware(req: NextRequest) {
  const expectedUser = process.env.SITE_AUTH_USER;
  const expectedPassword = process.env.SITE_AUTH_PASSWORD;
  const basicAuth = req.headers.get('authorization');

  if (expectedUser && expectedPassword && basicAuth) {
    const authValue = basicAuth.split(' ')[1] ?? '';
    const [user, pwd] = atob(authValue).split(':');

    if (user === expectedUser && pwd === expectedPassword) {
      return NextResponse.next();
    }
  }

  return new NextResponse('Authentication Required', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="TraceBridge"' },
  });
}

export const config = {
  // Everything except API routes, Next static assets, and the favicon.
  matcher: ['/((?!api/|_next/static|_next/image|favicon.ico).*)'],
};
