// scripts/etl-dataone.js
// Download DataOne ZIP, extract YMM maintenance, publish to Mongo (services_by_ymm)

require('dotenv').config({ path: '.env.local' });

const fsp = require('fs').promises;
const path = require('path');
const SFTPClient = require('ssh2-sftp-client');
const unzipper = require('unzipper');
const { parse } = require('csv-parse');
const { MongoClient } = require('mongodb');

const {
  DATAONE_SFTP_HOST,
  DATAONE_SFTP_PORT,
  DATAONE_SFTP_USER,
  DATAONE_SFTP_PASS,
  DATAONE_WORKDIR = '.dataone_work',
  MONGO_URL,
  MONGO_DB,
  DATAONE_DROP_COLLECTION // set to "1" to drop collection before writing
} = process.env;

for (const k of ['DATAONE_SFTP_HOST','DATAONE_SFTP_PORT','DATAONE_SFTP_USER','DATAONE_SFTP_PASS','MONGO_URL','MONGO_DB']) {
  if (!process.env[k] || String(process.env[k]).trim() === '') {
    console.error(`Missing required env var: ${k}`);
    process.exit(1);
  }
}

const ZIP_REMOTE = 'DataOne_US_LDV_Data.zip';
const ZIP_LOCAL  = path.join(DATAONE_WORKDIR, ZIP_REMOTE);

async function ensureDir(p) { await fsp.mkdir(p, { recursive: true }); }

async function downloadZip() {
  console.log('→ Connecting to SFTP ...');
  const sftp = new SFTPClient();
  await sftp.connect({
    host: DATAONE_SFTP_HOST,
    port: Number(DATAONE_SFTP_PORT),
    username: DATAONE_SFTP_USER,
    password: DATAONE_SFTP_PASS
  });
  console.log('✓ SFTP connected');

  await ensureDir(DATAONE_WORKDIR);
  console.log(`→ Downloading ${ZIP_REMOTE} to ${ZIP_LOCAL} ...`);
  await sftp.fastGet(ZIP_REMOTE, ZIP_LOCAL);
  console.log('✓ ZIP downloaded');
  await sftp.end();
}

async function extractZip() {
  console.log('→ Extracting ZIP ...');
  const directory = await unzipper.Open.file(ZIP_LOCAL);
  await directory.extract({ path: DATAONE_WORKDIR, concurrency: 6 });
  console.log('✓ ZIP extracted');
}

// Find a CSV by base name (case-insensitive); also searches one level of subdirs
async function findCsv(name) {
  const tryDirs = [DATAONE_WORKDIR];
  for (const de of await fsp.readdir(DATAONE_WORKDIR, { withFileTypes: true })) {
    if (de.isDirectory()) tryDirs.push(path.join(DATAONE_WORKDIR, de.name));
  }
  for (const dir of tryDirs) {
    for (const fn of await fsp.readdir(dir)) {
      if (/\.csv$/i.test(fn) && fn.toLowerCase() === `${name.toLowerCase()}.csv`) {
        return path.join(dir, fn);
      }
    }
  }
  throw new Error(`CSV not found: ${name}.csv`);
}

// ---- CSV helpers ----
const normalizeHeader = (h) =>
  h.toString()
   .replace(/\uFEFF/g, '')
   .trim()
   .replace(/^"+|"+$/g, '') // strip leading/trailing quotes (if quote:null fallback kicked in)
   .toLowerCase()
   .replace(/\s+/g, '_');

// Repair: stray ASCII letter right after a closing quote before comma/EOL
function repairWeirdClosingQuotes(txt) {
  return txt.replace(/"([A-Za-z])(?=(,|\r?\n))/g, '"');
}

async function parseBuffer(buf, opts) {
  return await new Promise((res, rej) => {
    parse(buf, opts, (err, rows) => err ? rej(err) : res(rows));
  });
}

async function loadCSVStrictWithRepair(filePath) {
  const buf = await fsp.readFile(filePath);
  const baseOpts = {
    columns: (header) => header.map(normalizeHeader),
    trim: true,
    skip_empty_lines: true,
    relax_column_count: true,
    relax_quotes: true,
    bom: true,
    skip_lines_with_error: true
  };
  try {
    return await parseBuffer(buf, baseOpts);
  } catch (e1) {
    const msg = String(e1 && e1.message || '');
    if (msg.includes('Invalid Closing Quote') || msg.includes('Non trimable')) {
      const repaired = Buffer.from(repairWeirdClosingQuotes(buf.toString('utf8')), 'utf8');
      try {
        console.warn(`Repaired quotes in ${path.basename(filePath)} and retrying ...`);
        return await parseBuffer(repaired, baseOpts);
      } catch (e2) {
        console.warn(`Repair failed on ${path.basename(filePath)}: ${e2.message}`);
        throw e2;
      }
    } else {
      throw e1;
    }
  }
}

async function loadCSVLenient(filePath) {
  try {
    return await loadCSVStrictWithRepair(filePath);
  } catch (e1) {
    console.warn(`Strict+repair failed on ${path.basename(filePath)}: ${e1.message}. Trying quote:null ...`);
    const buf = await fsp.readFile(filePath);
    return await parseBuffer(buf, {
      columns: (header) => header.map(normalizeHeader),
      trim: true,
      skip_empty_lines: true,
      relax_column_count: true,
      bom: true,
      quote: null,
      skip_lines_with_error: true
    });
  }
}

async function safeLoad(name, loader) {
  try {
    const p = await findCsv(name);
    return await loader(p);
  } catch (e) {
    console.warn(`Failed to load ${name}.csv: ${e.message} — continuing with empty set.`);
    return [];
  }
}

// ---- ID & number coercion ----
const coerceId = (v) => {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/\uFEFF/g, '').replace(/"/g, '').trim();
  const digits = s.match(/-?\d+/g);
  if (!digits) return null;
  const n = parseInt(digits.join(''), 10);
  return Number.isFinite(n) ? n : null;
};

const asInt   = (v) => (v === '' || v == null) ? null : parseInt(String(v).trim(), 10);
const asFloat = (v) => (v === '' || v == null) ? null : parseFloat(String(v).trim());

// ---- Column selection helpers ----
function preferExact(keys, preferred) {
  const set = new Set(keys.map(k => k.toLowerCase()));
  for (const p of preferred) {
    if (set.has(p.toLowerCase())) return p;
  }
  return null;
}

function detectIdColumn(rows, tableName, tokens = []) {
  if (!rows.length) return null;
  const keys = Object.keys(rows[0]);

  const scoreKey = (k) => {
    let s = 0;
    const name = k.toLowerCase();
    if (/_id$/.test(name)) s += 4;
    if (name.includes('id')) s += 2;
    for (const t of tokens) if (name.includes(t)) s += 2;
    return s;
  };

  const sample = rows.slice(0, Math.min(rows.length, 500));
  const numericRatio = (col) => {
    let good = 0, total = 0;
    for (const r of sample) {
      if (r[col] !== undefined) {
        total++;
        if (coerceId(r[col]) !== null) good++;
      }
    }
    return total ? good / total : 0;
  };

  let best = null, bestScore = -1;
  for (const k of keys) {
    const s = scoreKey(k) + numericRatio(k) * 5;
    if (s > bestScore) { best = k; bestScore = s; }
  }
  console.log(`• ${tableName}: auto-chose ID column "${best}" from [${keys.join(', ')}]`);
  return best;
}

// ---- Build YMM collection ----
async function buildServicesByYMM(mongo) {
  console.log('→ Loading relevant CSVs (YMM tables + defs) ...');

  // Definitions
  const DEF_MAINTENANCE = await safeLoad('DEF_MAINTENANCE', loadCSVLenient);                 // critical
  const DEF_SCHEDULE    = await safeLoad('DEF_MAINTENANCE_SCHEDULE', loadCSVLenient);
  const DEF_INTERVAL    = await safeLoad('DEF_MAINTENANCE_INTERVAL', loadCSVStrictWithRepair);
  const DEF_PARAM       = await safeLoad('DEF_MAINTENANCE_OPERATING_PARAMETER', loadCSVLenient);
  const DEF_CODE        = await safeLoad('DEF_MAINTENANCE_COMPUTER_CODE', loadCSVStrictWithRepair);
  const DEF_EVENT       = await safeLoad('DEF_MAINTENANCE_EVENT', loadCSVLenient);

  // YMM links
  const YMM_MAIN        = await safeLoad('LKP_YMM_MAINTENANCE', loadCSVStrictWithRepair);
  const YMM_INTERVAL    = await safeLoad('LKP_YMM_MAINTENANCE_INTERVAL', loadCSVStrictWithRepair);
  const YMM_EC          = await safeLoad('LKP_YMM_MAINTENANCE_EVENT_COMPUTER_CODE', loadCSVStrictWithRepair);

  console.log({
    DEF_MAINTENANCE: DEF_MAINTENANCE.length,
    DEF_SCHEDULE:    DEF_SCHEDULE.length,
    DEF_INTERVAL:    DEF_INTERVAL.length,
    DEF_PARAM:       DEF_PARAM.length,
    DEF_CODE:        DEF_CODE.length,
    DEF_EVENT:       DEF_EVENT.length,
    YMM_MAIN:        YMM_MAIN.length,
    YMM_INTERVAL:    YMM_INTERVAL.length,
    YMM_EC:          YMM_EC.length
  });

  // ---- Choose ID columns (force exact matches for YMM tables if present) ----
  const COL = {
    DEF_MAINTENANCE_id: preferExact(Object.keys(DEF_MAINTENANCE[0]||{}), ['maintenance_id']) ||
                         detectIdColumn(DEF_MAINTENANCE, 'DEF_MAINTENANCE', ['maintenance']),

    DEF_SCHEDULE_id:    preferExact(Object.keys(DEF_SCHEDULE[0]||{}), ['maintenance_schedule_id']) ||
                         detectIdColumn(DEF_SCHEDULE, 'DEF_MAINTENANCE_SCHEDULE', ['schedule']),

    DEF_INTERVAL_id:    preferExact(Object.keys(DEF_INTERVAL[0]||{}), ['maintenance_interval_id']) ||
                         detectIdColumn(DEF_INTERVAL, 'DEF_MAINTENANCE_INTERVAL', ['interval']),

    DEF_PARAM_id:       preferExact(Object.keys(DEF_PARAM[0]||{}), ['maintenance_operating_parameter_id']) ||
                         detectIdColumn(DEF_PARAM, 'DEF_MAINTENANCE_OPERATING_PARAMETER', ['operating','parameter']),

    DEF_CODE_id:        preferExact(Object.keys(DEF_CODE[0]||{}), ['maintenance_computer_code_id']) ||
                         detectIdColumn(DEF_CODE, 'DEF_MAINTENANCE_COMPUTER_CODE', ['computer','code']),

    DEF_EVENT_id:       preferExact(Object.keys(DEF_EVENT[0]||{}), ['maintenance_event_id']) ||
                         detectIdColumn(DEF_EVENT, 'DEF_MAINTENANCE_EVENT', ['event'])
  };

  // YMM_MAIN — force exact column names if present
  const ymKeys = Object.keys(YMM_MAIN[0] || {});
  const YMM_MAIN_mid   = preferExact(ymKeys, ['maintenance_id']) ||
                         detectIdColumn(YMM_MAIN, 'LKP_YMM_MAINTENANCE (maintenance id)', ['maintenance']);
  const YMM_MAIN_sched = preferExact(ymKeys, ['maintenance_schedule_id']) ||
                         detectIdColumn(YMM_MAIN, 'LKP_YMM_MAINTENANCE (schedule id)', ['schedule']);
  const YMM_MAIN_ymmid = preferExact(ymKeys, ['ymm_maintenance_id']) ||
                         detectIdColumn(YMM_MAIN, 'LKP_YMM_MAINTENANCE (ymm maintenance id)', ['ymm','maintenance']);

  // YMM_INTERVAL — force exact
  const yiKeys = Object.keys(YMM_INTERVAL[0] || {});
  const YMI_ymmid = preferExact(yiKeys, ['ymm_maintenance_id']) ||
                    detectIdColumn(YMM_INTERVAL, 'LKP_YMM_MAINTENANCE_INTERVAL (ymm maintenance id)', ['ymm','maintenance']);
  const YMI_intid = preferExact(yiKeys, ['maintenance_interval_id']) ||
                    detectIdColumn(YMM_INTERVAL, 'LKP_YMM_MAINTENANCE_INTERVAL (interval id)', ['interval']);
  const YMI_opid  = preferExact(yiKeys, ['maintenance_operating_parameter_id']) ||
                    detectIdColumn(YMM_INTERVAL, 'LKP_YMM_MAINTENANCE_INTERVAL (operating parameter id)', ['operating','parameter']);

  // YMM_EC — force exact
  const yeKeys = Object.keys(YMM_EC[0] || {});
  const YEC_ymmid  = preferExact(yeKeys, ['ymm_maintenance_id']) ||
                     detectIdColumn(YMM_EC, 'LKP_YMM_MAINTENANCE_EVENT_COMPUTER_CODE (ymm maintenance id)', ['ymm','maintenance']);
  const YEC_codeid = preferExact(yeKeys, ['maintenance_computer_code_id']) ||
                     detectIdColumn(YMM_EC, 'LKP_YMM_MAINTENANCE_EVENT_COMPUTER_CODE (computer code id)', ['computer','code']);
  const YEC_eventid = preferExact(yeKeys, ['maintenance_event_id']) ||
                      detectIdColumn(YMM_EC, 'LKP_YMM_MAINTENANCE_EVENT_COMPUTER_CODE (event id)', ['event']);

  console.log('Chosen columns (YMM tables):', {
    YMM_MAIN_mid, YMM_MAIN_sched, YMM_MAIN_ymmid,
    YMI_ymmid, YMI_intid, YMI_opid,
    YEC_ymmid, YEC_codeid, YEC_eventid
  });

  // ---- Build lookup maps using numeric keys ----
  const maintenanceById = new Map();
  for (const r of DEF_MAINTENANCE) {
    const id = coerceId(r[COL.DEF_MAINTENANCE_id]);
    if (id !== null) maintenanceById.set(id, r);
  }

  const schedById = new Map();
  for (const r of DEF_SCHEDULE) {
    const id = coerceId(r[COL.DEF_SCHEDULE_id]);
    if (id !== null) schedById.set(id, r);
  }

  const intervalById = new Map();
  for (const r of DEF_INTERVAL) {
    const id = coerceId(r[COL.DEF_INTERVAL_id]);
    if (id !== null) intervalById.set(id, r);
  }

  const paramById = new Map();
  for (const r of DEF_PARAM) {
    const id = coerceId(r[COL.DEF_PARAM_id]);
    if (id !== null) paramById.set(id, r);
  }

  const codeById = new Map();
  for (const r of DEF_CODE) {
    const id = coerceId(r[COL.DEF_CODE_id]);
    if (id !== null) codeById.set(id, r);
  }

  const eventById = new Map();
  for (const r of DEF_EVENT) {
    const id = coerceId(r[COL.DEF_EVENT_id]);
    if (id !== null) eventById.set(id, r);
  }

  console.log({
    maintenanceById: maintenanceById.size,
    schedById:       schedById.size,
    intervalById:    intervalById.size,
    paramById:       paramById.size,
    codeById:        codeById.size,
    eventById:       eventById.size
  });

  // ---- Group link tables (by YMM maintenance id) ----
  const ymiByYmm = new Map();
  for (const r of YMM_INTERVAL) {
    const ymmId = coerceId(r[YMI_ymmid]);
    if (ymmId === null) continue;
    if (!ymiByYmm.has(ymmId)) ymiByYmm.set(ymmId, []);
    ymiByYmm.get(ymmId).push(r);
  }

  const yecByYmm = new Map();
  for (const r of YMM_EC) {
    const ymmId = coerceId(r[YEC_ymmid]);
    if (ymmId === null) continue;
    if (!yecByYmm.has(ymmId)) yecByYmm.set(ymmId, []);
    yecByYmm.get(ymmId).push(r);
  }

  // ---- Build documents grouped by {year|make|model} ----
  const groups = new Map();
  let joined = 0, skippedNoId = 0, skippedNoDef = 0;

  for (const ym of YMM_MAIN) {
    const year  = asInt(ym.year);
    const make  = ym.make;
    const model = ym.model;

    const key = `${year}|${make}|${model}`;
    if (!groups.has(key)) {
      groups.set(key, { _id: key, year, make, model, services: [], generated_at: new Date().toISOString() });
    }

    const mid = coerceId(ym[YMM_MAIN_mid]);
    if (mid === null) { skippedNoId++; continue; }

    const svcDef = maintenanceById.get(mid);
    if (!svcDef) { skippedNoDef++; continue; }

    const schedId = coerceId(ym[YMM_MAIN_sched]);
    const sched   = (schedId !== null) ? schedById.get(schedId) : null;

    const ymmId = coerceId(ym[YMM_MAIN_ymmid]);
    const links = ymmId !== null ? (ymiByYmm.get(ymmId) || []) : [];
    const intervals = [];
    const opParamSet = new Map();

    for (const link of links) {
      const intId = coerceId(link[YMI_intid]);
      const i = intId !== null ? intervalById.get(intId) : null;
      if (i) {
        intervals.push({
          type: i.interval_type,               // 'At' or 'Every'
          value: asFloat(i.value),
          units: i.units,                      // 'miles' | 'months' | 'hours'
          initial: asFloat(i.initial_value)
        });
      }
      const pId = coerceId(link[YMI_opid]);
      if (pId !== null) {
        const p = paramById.get(pId);
        if (p) opParamSet.set(pId, {
          name:  p.operating_parameter,
          notes: p.operating_parameter_notes || undefined
        });
      }
    }

    const ecRaw = ymmId !== null ? (yecByYmm.get(ymmId) || []) : [];
    const codes = [];
    const events = [];
    for (const ec of ecRaw) {
      const cId = coerceId(ec[YEC_codeid]);
      if (cId !== null) {
        const c = codeById.get(cId);
        if (c && c.computer_code) codes.push(c.computer_code);
      }
      const eId = coerceId(ec[YEC_eventid]);
      if (eId !== null) {
        const e = eventById.get(eId);
        if (e && e.event) events.push(e.event);
      }
    }

    groups.get(key).services.push({
      ymm_maintenance_id: ymmId,
      category:  svcDef.maintenance_category || undefined,
      name:      svcDef.maintenance_name || undefined,
      notes:     svcDef.maintenance_notes || undefined,
      schedule:  sched ? { name: sched.schedule_name || undefined, description: sched.schedule_description || undefined } : undefined,
      intervals,
      operating_parameters: Array.from(opParamSet.values()),
      computer_codes: codes,
      events,
      eng_notes:  ym.eng_notes  || ym.engine_notes  || undefined,
      trans_notes:ym.trans_notes|| ym.transmission_notes || undefined,
      trim_notes: ym.trim_notes || undefined
    });

    joined++;
  }

  console.log(`Join stats → joined: ${joined}, skippedNoId: ${skippedNoId}, skippedNoDef: ${skippedNoDef}`);

  // DEBUG: How many groups have services > 0 in memory?
  let nonEmpty = 0, example = null;
  for (const doc of groups.values()) {
    if (Array.isArray(doc.services) && doc.services.length > 0) {
      nonEmpty++;
      if (!example) example = { _id: doc._id, year: doc.year, make: doc.make, model: doc.model, firstService: doc.services[0] };
    }
  }
  console.log(`DEBUG: in-memory groups with services > 0: ${nonEmpty} / ${groups.size}`);
  if (example) console.dir(example, { depth: 5 });

  // ---- Upsert to Mongo (REPLACE doc to persist services) ----
  const col = mongo.db(MONGO_DB).collection('services_by_ymm');

  if (DATAONE_DROP_COLLECTION === '1') {
    try {
      await col.drop();
      console.log('! Dropped collection services_by_ymm (per DATAONE_DROP_COLLECTION=1)');
    } catch {}
  }

  console.log(`→ Upserting ${groups.size} YMM documents to Mongo ...`);

  const ops = [];
  for (const doc of groups.values()) {
    ops.push({
      replaceOne: {
        filter: { _id: doc._id },
        replacement: doc,
        upsert: true
      }
    });
  }

  if (ops.length) {
    const res = await col.bulkWrite(ops, { ordered: false });
    console.log(`✓ Mongo bulkWrite done: matched=${res.matchedCount ?? 0}, modified=${res.modifiedCount ?? 0}, upserted=${res.upsertedCount ?? 0}`);
  } else {
    console.log('! No YMM docs to upsert');
  }

  // POST-WRITE: read back one example to prove services are persisted
  if (example) {
    const roundTrip = await col.findOne({ _id: example._id }, { projection: { _id: 1, year: 1, make: 1, model: 1, services: 1 } });
    if (roundTrip) {
      console.log(`POST-WRITE CHECK: ${roundTrip._id} services length = ${Array.isArray(roundTrip.services) ? roundTrip.services.length : 0}`);
    } else {
      console.log('POST-WRITE CHECK: could not read back example doc');
    }
  }
}

async function main() {
  await ensureDir(DATAONE_WORKDIR);
  await downloadZip();
  await extractZip();
  const mongo = await MongoClient.connect(MONGO_URL);
  try {
    await buildServicesByYMM(mongo);
  } finally {
    await mongo.close();
  }
  console.log('✓ ETL complete');
}

main().catch(err => {
  console.error('ETL failed:', err);
  process.exit(1);
});
