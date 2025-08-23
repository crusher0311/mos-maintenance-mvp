export default function Home() {
  return (
    <main className="min-h-screen grid place-items-center">
      <div className="w-full max-w-md rounded-xl border border-line bg-panel p-6 shadow-lg">
        <h1 className="text-xl font-semibold">MOS Maintenance MVP</h1>
        <p className="mt-2 text-muted">Tailwind + custom tokens are working.</p>
        <div className="mt-4 h-2 w-full rounded-full bg-[#0e1622] border border-line">
          <i className="block h-full w-3/4 bg-good" />
        </div>
      </div>
    </main>
  );
}
