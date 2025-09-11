// app/dashboard/settings/carfax/page.tsx
import { requireSession } from "@/lib/auth";
import { getDb } from "@/lib/mongo";
import CarfaxForm from "./CarfaxForm";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getCurrent(shopId: number) {
  const db = await getDb();
  const shop = await db.collection("shops").findOne(
    { shopId },
    { projection: { carfax: 1, carfaxLocationId: 1 } }
  );
  return {
    locationId: shop?.carfax?.locationId || shop?.carfaxLocationId || "",
  };
}

export default async function CarfaxSettingsPage() {
  const sess = await requireSession();
  const shopId = Number(sess.shopId);
  const current = await getCurrent(shopId);

  // Server Action to save the locationId
  async function save(formData: FormData) {
    "use server";
    const loc = String(formData.get("locationId") || "").trim();
    const db = await getDb();

    await db.collection("shops").updateOne(
      { shopId },
      {
        $set: {
          carfax: { locationId: loc },
          carfaxLocationId: loc, // keep a flat copy for legacy/fallback
          updatedAt: new Date(),
        },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true }
    );

    // Revalidate vehicle pages so CARFAX loads with the new ID
    revalidatePath("/dashboard/vehicles/[vin]");
  }

  return (
    <main className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">CARFAX Settings</h1>
      </div>

      <div className="rounded-2xl border p-4 space-y-4">
        <CarfaxForm shopId={shopId} initial={current} action={save} />
        <div className="text-xs text-neutral-600">
          <div><span className="font-medium">From environment</span> (same for all shops):</div>
          <ul className="list-disc ml-5">
            <li><code>CARFAX_POST_URL</code></li>
            <li><code>CARFAX_PDI</code></li>
          </ul>
        </div>
      </div>
    </main>
  );
}
