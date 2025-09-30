// scripts/test-oil-sticker.mjs
import pickOilService, { formatNextMiles, formatNextMonths } from '../src/lib/oilSticker.mjs';

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  return res.json();
}

function urlFor(params) {
  const u = new URL('http://localhost:3001/api/vin-next-due');
  Object.entries(params).forEach(([k,v]) => {
    if (v !== undefined && v !== null && v !== '') u.searchParams.set(k, String(v));
  });
  return u.toString();
}

async function runCases() {
  const cases = [
    {
      label: 'Normal schedule',
      params: { vin:'JH4DA9340LS000000', odometer: 61234, schedule:'normal' }
    },
    {
      label: 'Severe + manual, horizon 2k/2mo',
      params: {
        vin:'JH4DA9340LS000000', odometer:25000, monthsInService:20,
        schedule:'severe', trans:'manual', horizonMiles:2000, horizonMonths:2
      }
    }
  ];

  for (const t of cases) {
    const url = urlFor(t.params);
    console.log('\n===', t.label, '===\nGET', url, '\n');
    const data = await fetchJson(url);
    const sticker = pickOilService(data);
    console.log('Sticker object:', sticker);
    if (sticker) {
      console.log('Miles:', formatNextMiles(sticker));
      console.log('Months:', formatNextMonths(sticker));
    } else {
      console.log('No oil-related service found.');
    }
  }
}

runCases().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
