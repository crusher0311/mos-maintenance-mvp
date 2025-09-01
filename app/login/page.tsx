// app/login/page.tsx
import { Suspense } from "react";
import LoginForm from "./LoginForm";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";

// Force per-request rendering (no static caching)
export const dynamic = "force-dynamic";
// Also disable static optimization explicitly
export const revalidate = 0;

export default async function LoginPage() {
  // Very light server check: if already logged in, bounce to dashboard
  // This should never hang because getSession reads a cookie + 1 small DB doc.
  const sess = await getSession();
  if (sess) {
    redirect("/dashboard/customers");
  }

  return (
    <main className="mx-auto max-w-md p-6 space-y-6">
      <h1 className="text-2xl font-bold">Sign in</h1>
      <p className="text-sm text-gray-600">
        Enter your email and password to access your dashboard.
      </p>
      <Suspense fallback={<div className="text-sm text-gray-500">Loading…</div>}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
