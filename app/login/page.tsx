// app/login/page.tsx
export const dynamic = "force-dynamic";
export const revalidate = 0;

import LoginForm from "./LoginForm";

export default async function LoginPage() {
  // Keep this page dumb/lightweight; don't read DB or session here.
  // If the user is already logged in, the server-side middleware will
  // allow /dashboard and the client will navigate after login anyway.

  return (
    <main className="mx-auto max-w-md p-6 space-y-6">
      <h1 className="text-2xl font-bold">Sign in</h1>
      <p className="text-sm text-gray-600">
        Enter your email and password to access your dashboard.
      </p>
      <LoginForm />
    </main>
  );
}
