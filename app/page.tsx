export default function Home() {
  return (
    <main>
      <h1>MOS Maintenance  MVP</h1>
      <ul>
        <li><code>GET /api/ping</code></li>
        <li><code>POST /api/shops</code> {"{ name }"}  returns <code>shopId</code> & <code>webhookToken</code></li>
        <li><code>PUT /api/shops/[shopId]/credentials</code> {"{ apiKey, apiBase }"}</li>
        <li><code>POST /api/webhooks/autoflow/[token]</code> (use the shops <code>webhookToken</code>)</li>
        <li><code>POST /api/admin/db-indexes</code> (requires <code>X-Admin-Token</code>)</li>
      </ul>
    </main>
  );
}
