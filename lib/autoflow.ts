// lib/autoflow.ts
export async function autoflowFetch(path: string, shop: any) {
  const creds = `${shop.autoflow.apiKey}:${shop.autoflow.apiPassword}`;
  const auth = Buffer.from(creds).toString("base64");
  const url = `https://${shop.autoflow.subdomain}.autotext.me${path}`;

  const res = await fetch(url, {
    headers: {
      "Authorization": `Basic ${auth}`,
      "accept": "application/json",
    },
  });
  if (!res.ok) throw new Error(`Autoflow API error ${res.status}`);
  return res.json();
}
