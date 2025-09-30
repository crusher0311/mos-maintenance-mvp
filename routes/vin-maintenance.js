// routes/vin-maintenance.js
const express = require('express');
const router = express.Router();
const { MongoClient } = require('mongodb');

const key = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');

// --- NHTSA VIN decode (built-in fetch on Node 18+) ---
async function decodeVinWithNHTSA(vin) {
  const url = `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVin/${encodeURIComponent(vin)}?format=json`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`NHTSA HTTP ${resp.status}`);
  const data = await resp.json();
  const get = (name) => {
    const hit = data?.Results?.find(r => String(r.Variable).toLowerCase() === name.toLowerCase());
    return hit?.Value && hit.Value !== 'Not Applicable' ? String(hit.Value).trim() : null;
  };
  const year  = parseInt(get('Model Year'), 10);
  const make  = get('Make');
  const model = get('Model');
  if (!year || !make || !model) return null;
  return { year, make, model };
}

// --- text cleanup helpers ---
const stripQuotes = (v) => {
  if (v == null) return v;
  let s = String(v).trim();
  s = s.replace(/^"+(.*)"+$/s, '$1');  // remove one layer of outer quotes
  s = s.replace(/""/g, '"').trim();    // collapse doubled quotes
  return s === '' ? null : s;
};

// Merge case: name starts with a quote and notes ends with a quote -> combine.
function sanitizeService(svc) {
  let name = stripQuotes(svc.name);
  let notes = stripQuotes(svc.notes);

  if (/^".+/.test(svc.name || '') && /.+\"$/.test(svc.notes || '')) {
    const left = (svc.name || '').replace(/^"+/, '');
    const right = (svc.notes || '').replace(/"+$/, '');
    name = stripQuotes(`${left}, ${right}`);
    notes = null;
  }

  // clean schedule label
  let schedule = svc.schedule
    ? { name: stripQuotes(svc.schedule.name), description: stripQuotes(svc.schedule.description) }
    : undefined;

  // clean arrays
  const intervals = Array.isArray(svc.intervals) ? svc.intervals.map(i => ({
    type: stripQuotes(i.type), value: i.value, units: stripQuotes(i.units), initial: i.initial
  })) : [];

  const operating_parameters = Array.isArray(svc.operating_parameters)
    ? svc.operating_parameters.map(p => ({ name: stripQuotes(p.name), notes: stripQuotes(p.notes) }))
    : [];

  const computer_codes = Array.isArray(svc.computer_codes) ? svc.computer_codes.map(stripQuotes) : [];
  const events = Array.isArray(svc.events) ? svc.events.map(stripQuotes) : [];

  return {
    ...svc,
    name, notes, schedule, intervals, operating_parameters, computer_codes, events,
    category: stripQuotes(svc.category),
    eng_notes: stripQuotes(svc.eng_notes),
    trans_notes: stripQuotes(svc.trans_notes),
    trim_notes: stripQuotes(svc.trim_notes)
  };
}

function scheduleKind(svc) {
  const label = (svc.schedule?.name || '').toLowerCase();
  return label.includes('severe') ? 'severe' : 'normal';
}

// --- GET /api/vin-maintenance?vin=...&schedule=normal|severe|all&trans=auto|manual ---
router.get('/', async (req, res) => {
  const { vin } = req.query;
  const schedule = String(req.query.schedule || 'all').toLowerCase(); // normal | severe | all
  const trans = String(req.query.trans || '').toLowerCase();          // auto | manual | ""

  if (!vin || String(vin).length < 11) {
    return res.status(400).json({ error: 'vin is required (>= 11 chars)' });
  }

  let client;
  try {
    const decoded = await decodeVinWithNHTSA(String(vin).trim());
    if (!decoded) return res.status(404).json({ error: 'Could not decode Year/Make/Model from VIN' });

    const { year, make, model } = decoded;
    const makeKey = key(make);
    const modelKey = key(model);

    client = await MongoClient.connect(process.env.MONGO_URL);
    const db = client.db(process.env.MONGO_DB);
    const col = db.collection('services_by_ymm');

    let doc = await col.findOne({ year, make_key: makeKey, model_key: modelKey });
    if (!doc) doc = await col.findOne({ _id: `${year}|${make}|${model}` });
    if (!doc) {
      return res.status(404).json({ error: 'No maintenance data for decoded Year/Make/Model', decoded });
    }

    // sanitize + filter
    let services = (doc.services || []).map(sanitizeService);

    if (schedule === 'normal' || schedule === 'severe') {
      services = services.filter(svc => scheduleKind(svc) === schedule);
    }

    if (trans === 'auto' || trans === 'automatic') {
      services = services.filter(svc => !svc.trans_notes || svc.trans_notes.toLowerCase().includes('auto'));
    } else if (trans === 'manual') {
      services = services.filter(svc => !svc.trans_notes || svc.trans_notes.toLowerCase().includes('manual'));
    }

    // Optional: stable sort by category then name
    services.sort((a,b) => (a.category||'').localeCompare(b.category||'') || (a.name||'').localeCompare(b.name||''));

    res.json({
      vin,
      decoded: { year, make, model },
      year: doc.year, make: doc.make, model: doc.model,
      services
    });
  } catch (err) {
    console.error('GET /api/vin-maintenance error:', err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    if (client) await client.close();
  }
});

module.exports = router;
