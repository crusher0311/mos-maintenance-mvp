"use client";

type Props = {
  shopId: number;
  initial: { subdomain: string; apiKey: string };
};

export default function ClientForm({ shopId, initial }: Props) {
  async function save(form: HTMLFormElement) {
    const fd = new FormData(form);
    const body = {
      subdomain: String(fd.get("subdomain") || ""),
      apiKey: String(fd.get("apiKey") || ""),
      apiPassword: String(fd.get("apiPassword") || ""),
    };
    const r = await fetch(`/api/admin/shops/${shopId}/autoflow`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      alert(`Failed to save: ${j?.error || r.statusText}`);
      return;
    }
    alert("Saved!");
    form.reset();
  }

  async function test(invoice?: string) {
    const r = await fetch(`/api/admin/shops/${shopId}/autoflow/test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invoice: invoice || undefined }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) {
      alert(`Test failed: ${j?.error || r.statusText}`);
      return;
    }
    alert(j.note ? j.note : `Test OK${j.sample ? ` (invoice ${j.sample.invoice})` : ""}`);
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        save(e.currentTarget);
      }}
    >
      <div className="space-y-2">
        <label className="block text-sm font-medium">Shop Subdomain</label>
        <input
          name="subdomain"
          defaultValue={initial.subdomain}
          placeholder="e.g., carexpertsok"
          className="w-full border rounded p-2 text-sm"
        />
        <p className="text-xs text-neutral-500">Used to build https://&lt;subdomain&gt;.autotext.me</p>
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium">API Key</label>
        <input
          name="apiKey"
          defaultValue={initial.apiKey}
          className="w-full border rounded p-2 text-sm"
        />
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium">API Password</label>
        <input
          name="apiPassword"
          type="password"
          placeholder="••••••••"
          className="w-full border rounded p-2 text-sm"
        />
        <p className="text-xs text-neutral-500">Leave blank to keep existing password.</p>
      </div>

      <div className="flex items-center gap-3">
        <button type="submit" className="rounded bg-black text-white px-4 py-2">Save</button>

        <button
          type="button"
          onClick={() => test()}
          className="rounded border px-3 py-2 text-sm"
          title="Checks subdomain is saved; provide an invoice to fully verify."
        >
          Quick Test
        </button>

        <div className="flex items-center gap-1">
          <input id="invoice" name="invoice" placeholder="RO # (optional)" className="border rounded p-2 text-sm w-36" />
          <button
            type="button"
            onClick={() => {
              const el = (document.getElementById("invoice") as HTMLInputElement);
              test(el?.value?.trim() || undefined);
            }}
            className="rounded border px-3 py-2 text-sm"
          >
            Test with RO
          </button>
        </div>
      </div>
    </form>
  );
}
