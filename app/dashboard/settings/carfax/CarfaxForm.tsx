// app/dashboard/settings/carfax/CarfaxForm.tsx
"use client";

import { useState } from "react";

type Props = {
  shopId: number;
  initial: { locationId: string };
  onSavedLabel?: string; // optional, default: "Saved"
  action: (formData: FormData) => Promise<void>;
};

export default function CarfaxForm({ shopId, initial, action, onSavedLabel = "Saved" }: Props) {
  const [loc, setLoc] = useState(initial.locationId || "");
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  return (
    <form
      action={async (fd) => {
        setPending(true);
        setDone(false);
        fd.set("shopId", String(shopId));
        await action(fd);
        setPending(false);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
      className="space-y-3"
    >
      <div className="text-sm text-neutral-600">
        API Base & Product Data ID come from environment. Enter your shop’s unique CARFAX Location ID here.
      </div>

      <div className="flex items-center gap-3">
        <label className="w-40 text-sm font-medium">CARFAX Location ID</label>
        <input
          name="locationId"
          value={loc}
          onChange={(e) => setLoc(e.target.value)}
          className="border rounded px-2 py-1 text-sm w-72"
          placeholder="e.g. U4K2O3YEOX"
          autoComplete="off"
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="px-3 py-1 text-sm rounded bg-black text-white disabled:opacity-50"
        >
          {pending ? "Saving..." : "Save"}
        </button>
        {done && <span className="text-sm text-green-700">{onSavedLabel}</span>}
      </div>
    </form>
  );
}
