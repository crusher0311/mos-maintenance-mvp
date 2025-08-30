import Link from "next/link";

export default function Home() {
  return (
    <main className="p-6">
      <h1 className="text-xl font-semibold mb-4">MOS Maintenance MVP</h1>
      <p><Link href="/dashboard" className="text-blue-600 underline">Go to Dashboard</Link></p>
    </main>
  );
}
