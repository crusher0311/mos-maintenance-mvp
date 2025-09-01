// lib/auth.ts
import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getDb } from '@/lib/mongo';

export const SESSION_COOKIE = 'session_token';

export type SessionInfo = {
  token: string;
  shopId: number;
  email: string;
  role: string;
};

export async function getSession(): Promise<SessionInfo | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const db = await getDb();
  const sess = await db.collection('sessions').findOne({
    token,
    expiresAt: { $gt: new Date() },
  });
  if (!sess) return null;

  const user = await db.collection('users').findOne(
    { _id: sess.userId },
    { projection: { email: 1, role: 1 } }
  );
  if (!user) return null;

  return {
    token,
    shopId: sess.shopId as number,
    email: user.email as string,
    role: (user.role as string) || 'owner',
  };
}

export async function requireSession(): Promise<SessionInfo> {
  const s = await getSession();
  if (!s) redirect('/login');
  return s;
}

// Optional: use this in API routes when setting the cookie
export function sessionCookieOptions(maxAgeSeconds = 60 * 60 * 24 * 30) {
  return {
    httpOnly: true as const,
    secure: true as const,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: maxAgeSeconds,
  };
}
