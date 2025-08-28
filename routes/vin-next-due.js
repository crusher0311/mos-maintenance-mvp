// routes/vin-next-due.js
// Compute due / upcoming maintenance from VIN + usage (odometer, monthsInService)

const express = require('express');
const router = express.Router();
const { MongoClient } = require('mongodb');

// --- small utils ---
const key = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');

// Built-in fetch (Node 18+)
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

// --- text cleanup helpers (same idea used in your other route) ---
const stripQuotes = (v) => {
  if (v == null) return v;
  let s = String(v).trim();
  s = s.replace(/^"+(.*)"+$/s, '$1');  // remove one layer of outer quotes
  s = s.replace(/""/g, '"').trim();    // collapse doubled quotes
  return s === '' ? null : s;
};

// Merge case: name starts quoted & notes ends quoted -> combine
function sanitizeService(svc) {
  let name = stripQuotes(svc.name);
  let notes = stripQuotes(svc.notes);

  if (/^".+/.test(svc.name || '') && /.+\"$/.test(svc.notes || '')) {
    const left = (svc.name || '').replace(/^"+/, '');
    const right = (svc.notes || '').replace(/"+$/, '');
    name = stripQuotes(`${left}, ${right}`);
    notes = null;
  }

  let schedule = svc.schedule
    ? { name: stripQuotes(svc.schedule.name), description: stripQuotes(svc.schedule.description) }
    : undefined;

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

const scheduleKind = (svc) => {
  const label = (svc.schedule?.name || '').toLowerCase();
  return label.includes('severe') ? 'severe' : 'normal';
};

// --- units & threshold helpers ---
const normUnits = (u) => {
  const s = String(u || '').toLowerCase();
  if (s.startsWith('mile')) return 'miles';
  if (s.startsWith('month')) return 'months';
  if (s.startsWith('hour')) return 'hours';
  return s || null;
};

// For "Every" rules
function nextFromEvery(current, { value, initial = 0 }) {
  const v = Number(value || 0);
  const i0 = Number(initial || 0);
  if (!Number.isFinite(v) || v <= 0) return { next: null, last: null, due: false };
  if (!Number.isFinite(current) || current < 0) return { next: i0, last: null, due: false };
  if (current < i0) return { next: i0, last: null, due: false };

  const k = Math.ceil((current - i0) / v);
  const next = i0 + k * v;                  // next scheduled tick
  const last = i0 + Math.max(0, k - 1) * v; // last tick you should have hit
  const due = current >= next - 1e-9;
  return { next, last, due };
}

// For multiple "At" thresholds (e.g., 15k, 30k, 60k): compare against the nearest crossed step
function statusAt(current, thresholds) {
  if (!Number.isFinite(current) || !thresholds?.length) {
    return { due: false, last: null, next: thresholds?.length ? Math.min(...thresholds) : null, overdueBy: null };
  }
  const uniq = Array.from(new Set(thresholds.filter(n => Number.isFinite(n)))).sort((a,b)=>a-b);
  let last = null, next = null;
  for (const t of uniq) {
    if (current >= t - 1e-9) last = t;
    else { next = t; break; }
  }
  const due = last != null && current >= last - 1e-9;
  const overdueBy = due && last != null ? Math.max(0, Math.round(current - last)) : null;
  return { due, last, next, overdueBy };
}

// For multiple "Every" rules: take the nearest next; if any is overdue, mark due
function statusEvery(current, everyRules) {
  if (!Number.isFinite(current) || !everyRules?.length) {
    return { due: false, last: null, next: null, overdueBy: null };
  }
  let anyDue = false, bestNext = null, bestOver = null, bestLast = null;
  for (const r of everyRules) {
    const res = nextFromEvery(current, r);
    if (res.next != null) bestNext = Math.min(bestNext ?? Infinity, res.next);
    if (res.due) {
      anyDue = true;
      const over = current - res.next;
      if (bestOver == null || over > bestOver) { bestOver = over; bestLast = res.last; }
    }
  }
  if (bestNext === Infinity) bestNext = null;
  return {
    due: anyDue,
    last: bestLast,
    next: bestNext,
    overdueBy: anyDue ? Math.max(0, Math.round(bestOver)) : null
  };
}

// Core evaluator: computes due/upcoming with horizons
function computeDue(service, usage, horizons) {
  const miles = Number.isFinite(usage.miles) ? usage.miles : null;
  const months = Number.isFinite(usage.months) ? usage.months : null;

  const milesAt = [], milesEvery = [];
  const monthsAt = [], monthsEvery = [];

  for (const it of (service.intervals || [])) {
    const type = (it.type || '').toLowerCase(); // 'at' | 'every'
    const units = normUnits(it.units);
    const value = Number(it.value || 0);
    const initial = Number(it.initial || 0);
    if (!Number.isFinite(value)) continue;

    if (units === 'miles') {
      if (type === 'at') milesAt.push(value);
      else if (type === 'every') milesEvery.push({ value, initial });
    } else if (units === 'months') {
      if (type === 'at') monthsAt.push(value);
      else if (type === 'every') monthsEvery.push({ value, initial });
    }
  }

  let mAt = { due: false, next: null, overdueBy: null }, mEv = { due: false, next: null, overdueBy: null };
  let moAt = { due: false, next: null, overdueBy: null }, moEv = { due: false, next: null, overdueBy: null };

  if (miles != null) { mAt = statusAt(miles, milesAt); mEv = statusEvery(miles, milesEvery); }
  if (months != null) { moAt = statusAt(months, monthsAt); moEv = statusEvery(months, monthsEvery); }

  const dueMiles = mAt.due || mEv.due;
  const dueMonths = moAt.due || moEv.due;

  const nextMiles = Math.min(...[mAt.next, mEv.next].filter(v => v != null));
  const nextMonths = Math.min(...[moAt.next, moEv.next].filter(v => v != null));
  const nextMilesVal = Number.isFinite(nextMiles) ? nextMiles : null;
  const nextMonthsVal = Number.isFinite(nextMonths) ? nextMonths : null;

  const overdueByMiles = mAt.due ? mAt.overdueBy : (mEv.due ? mEv.overdueBy : null);
  const overdueByMonths = moAt.due ? moAt.overdueBy : (moEv.due ? moEv.overdueBy : null);

  let upcoming = false;
  if (!dueMiles && miles != null && nextMilesVal != null) {
    const delta = nextMilesVal - miles;
    if (delta >= 0 && delta <= horizons.miles) upcoming = true;
  }
  if (!dueMonths && months != null && nextMonthsVal != null) {
    const delta = nextMonthsVal - months;
    if (delta >= 0 && delta <= horizons.months) upcoming = true;
  }

  return {
    due: !!(dueMiles || dueMonths),
    upcoming,
    triggers: {
      miles: { have: miles != null, due: dueMiles, next: nextMilesVal, overdueBy: overdueByMiles },
      months:{ have: months != null, due: dueMonths, next: nextMonthsVal, overdueBy: overdueByMonths }
    }
  };
}

// GET /api/vin-next-due?vin=...&odometer=...&monthsInService=...&schedule=normal|severe|all&trans=auto|manual&horizonMiles=1000&horizonMonths=1
router.get('/', async (req, res) => {
  const { vin } = req.query;
  if (!vin || String(vin).length < 11) {
    return res.status(400).json({ error: 'vin is required (>= 11 chars)' });
  }

  const odometer = req.query.odometer != null ? Number(req.query.odometer) : null;
  const monthsInService = req.query.monthsInService != null ? Number(req.query.monthsInService) : null;
  if (!Number.isFinite(odometer) && !Number.isFinite(monthsInService)) {
    return res.status(400).json({ error: 'Provide at least one of: odometer (miles) or monthsInService (months)' });
  }

  const schedule = String(req.query.schedule || 'all').toLowerCase(); // normal | severe | all
  const trans = String(req.query.trans || '').toLowerCase();          // auto | manual | ""

  const horizonMiles = Number.isFinite(Number(req.query.horizonMiles)) ? Number(req.query.horizonMiles) : 1000;
  const horizonMonths = Number.isFinite(Number(req.query.horizonMonths)) ? Number(req.query.horizonMonths) : 1;

  let client;
  try {
    // 1) VIN -> year/make/model
    const decoded = await decodeVinWithNHTSA(String(vin).trim());
    if (!decoded) return res.status(404).json({ error: 'Could not decode Year/Make/Model from VIN' });

    // 2) Fetch YMM document
    const { year, make, model } = decoded;
    const makeKey = key(make);
    const modelKey = key(model);

    client = await MongoClient.connect(process.env.MONGO_URL);
    const db = client.db(process.env.MONGO_DB);
    const col = db.collection('services_by_ymm');

    let doc = await col.findOne({ year, make_key: makeKey, model_key: modelKey });
    if (!doc) doc = await col.findOne({ _id: `${year}|${make}|${model}` });
    if (!doc) return res.status(404).json({ error: 'No maintenance data for decoded Year/Make/Model', decoded });

    // 3) sanitize + filter by schedule/trans
    let services = (doc.services || []).map(sanitizeService);

    if (schedule === 'normal' || schedule === 'severe') {
      services = services.filter(s => scheduleKind(s) === schedule);
    }

    if (trans === 'auto' || trans === 'automatic') {
      services = services.filter(s => !s.trans_notes || s.trans_notes.toLowerCase().includes('auto'));
    } else if (trans === 'manual') {
      services = services.filter(s => !s.trans_notes || s.trans_notes.toLowerCase().includes('manual'));
    }

    // 4) compute due / upcoming
    const usage = { miles: Number.isFinite(odometer) ? odometer : null, months: Number.isFinite(monthsInService) ? monthsInService : null };
    const horizons = { miles: horizonMiles, months: horizonMonths };

    const enriched = services
      .filter(s => Array.isArray(s.intervals) && s.intervals.length)
      .map(s => {
        const calc = computeDue(s, usage, horizons);
        return {
          category: s.category,
          name: s.name,
          schedule: s.schedule?.name || null,
          intervals: s.intervals,
          trans_notes: s.trans_notes || null,
          due: calc.due,
          upcoming: calc.upcoming,
          triggers: calc.triggers
        };
      });

    const sortByCatName = (a, b) =>
      (a.category || '').localeCompare(b.category || '') ||
      (a.name || '').localeCompare(b.name || '');

    const dueNow = enriched.filter(e => e.due).sort(sortByCatName);
    const upcoming = enriched.filter(e => !e.due && e.upcoming).sort(sortByCatName);

    res.json({
      vin,
      decoded: { year, make, model },
      inputs: {
        odometer: Number.isFinite(odometer) ? odometer : null,
        monthsInService: Number.isFinite(monthsInService) ? monthsInService : null,
        schedule,
        trans,
        horizonMiles,
        horizonMonths
      },
      counts: { total: enriched.length, dueNow: dueNow.length, upcoming: upcoming.length },
      dueNow,
      upcoming
    });
  } catch (err) {
    console.error('GET /api/vin-next-due error:', err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    if (client) await client.close();
  }
});

module.exports = router;
