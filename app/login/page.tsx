import { Suspense } from "react";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";

export default function LoginPage() {
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
