import { getMongo } from "@/lib/mongo";

export async function GET() {
  try {
    const client = await getMongo();
    const admin = client.db().admin();
    const ping = await admin.ping();
    return Response.json({ ok: true, ping }, { status: 200 });
  } catch (e: any) {
    return Response.json({ ok: false, error: e?.message }, { status: 500 });
  }
}
