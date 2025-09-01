// app/api/auth/logout/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDb } from "@/lib/mongo";

export async function POST() {
  try {
    const token = cookies().get("session_token")?.value;

    if (token) {
      const db = await getDb();
      await db.collection("sessions").deleteOne({ token });
    }

    // Clear cookie by setting it expired
    cookies().set("session_token", "", {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Logout error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
