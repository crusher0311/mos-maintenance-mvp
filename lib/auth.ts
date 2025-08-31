import { NextRequest } from "next/server";
import { getDb } from "@/lib/mongo";
import { ObjectId } from "mongodb";

export type SessionUser = {
  _id: ObjectId;
  shopId: number;
  email: string;
  emailLower: string;
  role: "owner" | "manager" | "staff" | string;
};

export async function getSessionFromRequest(req: NextRequest) {
  const sid = req.cookies.get("sid")?.value;
  if (!sid) return null;

  const db = await getDb();
  const sessions = db.collection("sessions");
  const users = db.collection("users");

  const now = new Date();
  const sess = await sessions.findOne({ token: sid, expiresAt: { $gt: now } });
  if (!sess) return null;

  const user = await users.findOne({ _id: sess.userId as ObjectId });
  if (!user) return null;

  const u: SessionUser = {
    _id: user._id as ObjectId,
    shopId: sess.shopId as number,
    email: user.email as string,
    emailLower: user.emailLower as string,
    role: (user.role as string) || "staff",
  };

  return { sid, user: u, shopId: u.shopId };
}

export async function requireOwner(req: NextRequest) {
  const s = await getSessionFromRequest(req);
  if (!s || s.user.role !== "owner") return null;
  return s;
}
