/**
 * scripts/dataone-import.js
 * Downloads DataOne SFTP ZIP + DDL, extracts CSVs, bulk-loads to MongoDB
 * Staging -> atomic swap pattern with backpressure + safe awaiting.
 */
const path = require("path");
const fs = require("fs");
const { pipeline } = require("stream/promises");
const SFTPClient = require("ssh2-sftp-client");
const unzipper = require("unzipper");
const csvParse = require("csv-parse").parse;
// p-limit (esm compat)
const pLimitMod = require("p-limit");
const pLimit = pLimitMod.default || pLimitMod;
const { MongoClient } = require("mongodb");

// ---- helpers ----
const joinPosix = (...parts) => parts.join("/").replace(/\/+/g, "/"); // for SFTP remote paths only

const {
  DATAONE_SFTP_HOST,
  DATAONE_SFTP_PORT = "2222",
  DATAONE_SFTP_USER,
  DATAONE_SFTP_PASS,
  DATAONE_REMOTE_DIR = "/",
  DATAONE_DOWNLOAD_DIR = "./.dataone/incoming",
  DATAONE_EXTRACT_DIR = "./.dataone/extracted",
  MONGODB_URI,
  MONGODB_DB,
} = process.env;

if (!MONGODB_URI || !MONGODB_DB) {
  throw new Error("Missing MONGODB_URI or MONGODB_DB env vars");
}

async function ensureDirs() {
  for (const d of [DATAONE_DOWNLOAD_DIR, DATAONE_EXTRACT_DIR]) {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  }
}

async function downloadLatestFiles() {
  const sftp = new SFTPClient();
  await sftp.connect({
    host: DATAONE_SFTP_HOST,
    port: Number(DATAONE_SFTP_PORT),
    username: DATAONE_SFTP_USER,
    password: DATAONE_SFTP_PASS,
  });

  const REMOTE_DIR =
    (DATAONE_REMOTE_DIR || "/").replace(/\\/g, "/").replace(/\/+$/, "") || "/";

  try {
    const list = await sftp.list(REMOTE_DIR || "/");
    console.log("Remote dir:", REMOTE_DIR || "/");
    console.log("Remote files:", list.map((f) => f.name));

    const zip = list.find((f) => /DataOne_US_LDV_Data\.zip/i.test(f.name));
    const ddl = list.find((f) => /DataOne_US_LDV_DDL\.sql/i.test(f.name));
    if (!zip) throw new Error("Cannot find DataOne_US_LDV_Data.zip on SFTP");
    if (!ddl) throw new Error("Cannot find DataOne_US_LDV_DDL.sql on SFTP");

    const zipLocal = path.join(DATAONE_DOWNLOAD_DIR, zip.name);
    const ddlLocal = path.join(DATAONE_DOWNLOAD_DIR, ddl.name);

    await sftp.fastGet(joinPosix(REMOTE_DIR || "/", zip.name), zipLocal);
    await sftp.fastGet(joinPosix(REMOTE_DIR || "/", ddl.name), ddlLocal);

    return { zipLocal, ddlLocal };
  } finally {
    await sftp.end();
  }
}

async function extractZip(zipPath, outDir) {
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  await pipeline(fs.createReadStream(zipPath), unzipper.Extract({ path: outDir }));
}

async function importCsvToMongo(filePath, client) {
  const db = client.db(MONGODB_DB);
  const base = path.basename(filePath);
  const table = base.replace(/\.csv$/i, "");
  const collStage = `dataone_${table.toLowerCase()}__staging`;
  const collLive = `dataone_${table.toLowerCase()}`;

  // (Re)create staging
  const existing = await db.listCollections({ name: collStage }).toArray();
  if (existing.length) await db.collection(collStage).drop();
  await db.createCollection(collStage);
  const coll = db.collection(collStage);

  // backpressure-friendly settings
  const BATCH = 1000;
  let batch = [];
  let inserted = 0;
  let badRows = 0;

  // track all write ops and await them before continuing
  const pendingWrites = [];

  const readStream = fs.createReadStream(filePath, { encoding: "utf8" });
  const parser = csvParse({
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax: true,
    relax_quotes: true,
    escape: "\\",
    quote: '"',
  });

  readStream.pipe(parser);

  const flush = async () => {
    if (!batch.length) return;
    const docs = batch;
    batch = [];
    // pause parser until the write finishes (backpressure)
    parser.pause();
    const p = coll
      .insertMany(docs, { ordered: false, writeConcern: { w: 1 } })
      .then(() => {
        inserted += docs.length;
      })
      .catch((e) => {
        console.warn(`Insert warn ${table}:`, e?.code || e?.message);
      })
      .finally(() => parser.resume());
    pendingWrites.push(p);
    await p; // ensure sequential writes (reduces pool churn)
  };

  await new Promise((resolve, reject) => {
    parser
      .on("error", reject)
      .on("data", async (row) => {
        try {
          // normalize simple numeric types
          for (const k of Object.keys(row)) {
            const v = row[k];
            if (v === "") {
              row[k] = null;
            } else if (typeof v === "string" && /^\d+$/.test(v)) {
              row[k] = Number(v);
            } else if (typeof v === "string" && /^\d+\.\d+$/.test(v)) {
              row[k] = Number(v);
            }
          }
          batch.push(row);
          if (batch.length >= BATCH) {
            // await write before accepting more
            await flush();
          }
        } catch {
          badRows++;
        }
      })
      .on("end", async () => {
        try {
          await flush(); // write remaining
          // wait any last pending writes (safety)
          await Promise.allSettled(pendingWrites);

          // Only after all writes, create indexes
          const sample = await coll.findOne({});
          if (sample?.VIN) await coll.createIndex({ VIN: 1 });
          if (sample?.ModelYear) await coll.createIndex({ ModelYear: 1 });
          if (sample?.VIN && sample?.ModelYear) {
            await coll.createIndex({ VIN: 1, ModelYear: 1 });
          }

          // swap staging -> live
          const liveExists = await db.listCollections({ name: collLive }).toArray();
          if (liveExists.length) await db.collection(collLive).drop();
          await db.collection(collStage).rename(collLive, { dropTarget: true });

          if (badRows) console.warn(`Parser tolerated ${badRows} malformed row(s) in ${table}.`);
          resolve();
        } catch (e) {
          reject(e);
        }
      });
  });

  return { table, inserted, badRows };
}

async function main() {
  await ensureDirs();
  const { zipLocal, ddlLocal } = await downloadLatestFiles();
  console.log("Downloaded:", { zipLocal, ddlLocal });

  await extractZip(zipLocal, DATAONE_EXTRACT_DIR);
  const files = fs
    .readdirSync(DATAONE_EXTRACT_DIR)
    .filter((f) => f.toLowerCase().endsWith(".csv"))
    .map((f) => path.join(DATAONE_EXTRACT_DIR, f));

  // Be generous with timeouts for large imports
  const client = new MongoClient(MONGODB_URI, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 30000,
    socketTimeoutMS: 600000, // 10 min
  });

  await client.connect();
  try {
    // Import tables one at a time to minimize pool clears
    const limit = pLimit(1);
    const results = await Promise.all(files.map((f) => limit(() => importCsvToMongo(f, client))));
    console.table(results);
  } finally {
    await client.close();
  }

  console.log("DataOne import complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
