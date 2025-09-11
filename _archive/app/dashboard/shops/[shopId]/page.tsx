// /app/dashboard/shops/[shopId]/page.tsx
import React from "react";

export const dynamic = "force-dynamic";

async function fetchShop(shopId: string) {
  const url = `${process.env.NEXT_PUBLIC_BASE_URL || ""}/api/shops/${encodeURIComponent(shopId)}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return null;
  return res.json();
}

export default async function ShopDetailPage({ params }: { params: Promise<{ shopId: string }> }) {
  const { shopId } = await params;
  const data = await fetchShop(shopId);
  if (!data?.shop) return <div className="p-6">Not found</div>;
  const shop = data.shop;

  // We’ll render a client-only origin for the webhook preview
  const fallbackHost = process.env.NEXT_PUBLIC_BASE_URL || "";
  const pathOnly = `/api/webhooks/autoflow/${shop.token}`;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
      <h1 className="text-2xl font-semibold">{shop.name}</h1>

      <div className="rounded-xl border p-4 bg-white space-y-3">
        <div className="text-sm font-medium">Webhook URL</div>
        <div className="text-xs text-slate-600">This URL is unique to this shop.</div>
        <div className="flex items-center gap-2">
          <code className="px-2 py-1 bg-slate-100 rounded">{pathOnly}</code>
          <span className="text-xs text-slate-500">(full origin shown below)</span>
        </div>
        <div className="text-xs">
          <em>Full URL at runtime:</em>{" "}
          <code id="fullUrl" className="px-2 py-1 bg-slate-100 rounded">
            {(fallbackHost ? `${fallbackHost}` : "") + pathOnly}
          </code>
        </div>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function(){
                try{
                  var el=document.getElementById('fullUrl');
                  var url=(location.origin||'')+'${pathOnly}';
                  if(el) el.textContent=url;
                }catch(e){}
              })();
            `,
          }}
        />
      </div>

      <div className="rounded-xl border p-4 bg-white space-y-3">
        <div className="text-sm font-medium">AutoFlow Credentials</div>
        <form className="grid gap-3" onSubmit={async (e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget as HTMLFormElement);
          const body = {
            apiKey: fd.get("apiKey") || "",
            apiBaseUrl: fd.get("apiBaseUrl") || "",
            webhookSecret: fd.get("webhookSecret") || "",
          };
          const res = await fetch(`/api/shops/${encodeURIComponent(shopId)}/credentials`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          if (res.ok) location.reload(); else alert((await res.json()).error ?? "Failed");
        }}>
          <input name="apiKey" placeholder="AutoFlow API Key" defaultValue={shop?.autoflow?.apiKey || ""} className="border rounded-lg px-3 py-2" />
          <input name="apiBaseUrl" placeholder="AutoFlow API Base URL (optional)" defaultValue={shop?.autoflow?.apiBaseUrl || ""} className="border rounded-lg px-3 py-2" />
          <input name="webhookSecret" placeholder="Webhook Signing Secret (optional)" defaultValue={shop?.autoflow?.webhookSecret || ""} className="border rounded-lg px-3 py-2" />
          <button className="w-fit rounded-lg border px-3 py-2 hover:bg-slate-50">Save</button>
        </form>
        <div className="text-xs text-slate-500">
          For MVP these are stored in Mongo as plain text. For production, use KMS or field-level encryption.
        </div>
      </div>

      <div className="rounded-xl border p-4 bg-white space-y-3">
        <div className="text-sm font-medium">AutoFlow Webhook Setup (copy/paste)</div>
        <ol className="list-decimal ml-5 space-y-2 text-sm">
          <li>In AutoFlow, go to <strong>Settings → Webhooks</strong> (or Integrations).</li>
          <li>Create a webhook and set the <strong>URL</strong> to the value shown above under “Full URL”.</li>
          <li>(Optional) If AutoFlow supports signing, set the <strong>signing secret</strong> to the “Webhook Signing Secret” you saved here.</li>
          <li>Select the events you want delivered (e.g., RO created/updated, appointment created/updated).</li>
          <li>Save. Use AutoFlow’s “Test” button if available; you should see events appear in our logs.</li>
        </ol>
        <div className="text-xs text-slate-500">
          We accept JSON and look for an <code>event</code> type and <code>data</code> payload. Unknown shapes are still logged.
        </div>
      </div>
    </div>
  );
}
