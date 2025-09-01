// app/login/page.tsx
import { Suspense } from "react";
import LoginForm from "./LoginForm";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  // Use your custom helper instead of NextAuth's getServerSession
  const session = await getSession();
  if (session) redirect("/dashboard/customers");

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
