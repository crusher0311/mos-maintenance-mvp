import { Suspense } from "react";
import SetupForm from "./SetupForm";

export const dynamic = "force-dynamic";

export default function SetupPage() {
  return (
    <main className="mx-auto max-w-md p-6 space-y-6">
      <h1 className="text-2xl font-bold">Complete Setup</h1>
      <p className="text-sm text-gray-600">
        Enter your email & password to create the first user for this shop.
      </p>

      <Suspense fallback={<div className="text-sm text-gray-500">Loading setup form…</div>}>
        <SetupForm />
      </Suspense>
    </main>
  );
}
