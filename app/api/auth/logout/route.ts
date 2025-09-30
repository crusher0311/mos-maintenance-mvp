import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export const runtime = "nodejs";

export async function POST() {
  const store = await cookies(); // ⬅️ await

  // read if you need it for logging
  const token = store.get("session_token")?.value ?? store.get("sid")?.value;

  // clear either cookie name you might be using
  store.set({
    name: "session_token",
    value: "",
    path: "/",
    maxAge: 0,
  });
  store.set({
    name: "sid",
    value: "",
    path: "/",
    maxAge: 0,
  });

  return NextResponse.json({ ok: true });
}
