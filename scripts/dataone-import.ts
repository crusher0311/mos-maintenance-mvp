// scripts/dataone-import.ts
import path from "path";
import fs from "fs";
import { pipeline } from "stream/promises";
import SFTPClient from "ssh2-sftp-client";
import unzipper from "unzipper";
import { parse } from "fast-csv";
import pLimit from "p-limit";
import { MongoClient } from "mongodb";

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
  for (const d of [DATAONE_DOWNLOAD_DIR!, DATAONE_EXTRACT_DIR!]) {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  }
}

async function downloadLatestFiles() {
  const sftp = new SFTPClient();
  await sftp.connect({
    host: DATAONE_SFTP_HOST!,
    port: Number(DATAONE_SFTP_PORT),
    username: DATAONE_SFTP_USER!,
    password: DATAONE_SFTP_PASS!,
  });

  try {
    const list = await sftp.list(DATAONE_REMOTE_DIR!);
    // Find the latest ZIP and DDL (filenames from docs)
    const zip = list.find(f => /DataOne_US_LDV_Data\.zip/i.test(f.name));
    const ddl = list.find(f => /DataOne_US_LDV_DDL\.sql/i.test(f.name));

    if (!zip) throw new Error("Cannot find DataOne_US_LDV_Data.zip on SFTP");
    if (!ddl) throw new Error("Cannot find DataOne_US_LDV_DDL.sql on SFTP");

    const zipLocal = path.join(DATAONE_DOWNLOAD_DIR!, zip.name);
    const ddlLocal = path.join(DATAONE_DOWNLOAD_DIR!, ddl.name);

    await sftp.fastGet(path.join(DATAONE_REMOTE_DIR!, zip.name), zipLocal);
    await sftp.fastGet(path.join(DATAONE_REMOTE_DIR!, ddl.name), ddlLocal);

    return { zipLocal, ddlLocal };
  } finally {
    await sftp.end();
  }
}

async function extractZip(zipPath: string, outDir: string) {
  // Clear extract dir
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  await pipeline(
    fs.createReadStream(zipPath),
    unzipper.Extract({ path: outDir })
  );
}

type Row = Record<string, any>;

async function importCsvToMongo(filePath: string, client: MongoClient) {
  const db = client.db(MONGODB_DB);
  const base = path.basename(filePath);
  // Derive collection name from CSV file. e.g., VINBasic.csv -> dataone_vinbasic
  const table = base.replace(/\.csv$/i, "");
  const collStage = `dataone_${table.toLowerCase()}__staging`;
  const collLive = `dataone_${table.toLowerCase()}`;

  // (Re)create staging
  const existing = await db.listCollections({ name: collStage }).toArray();
  if (existing.length) await db.collection(collStage).drop();

  await db.createCollection(collStage);
  const coll = db.collection(collStage);

  const BATCH = 2000;
  let batch: Row[] = [];
  let inserted = 0;

  await new Promise<void>((resolve, reject) => {
    fs.createReadStream(filePath)
      .pipe(parse({ headers: true, ignoreEmpty: true, trim: true }))
      .on("error", reject)
      .on("data", (row: Row) => {
        // Basic type normalization (numbers)
        for (const k of Object.keys(row)) {
          const v = row[k];
          if (v === "") { row[k] = null; continue; }
          if (/^\d+$/.test(v)) row[k] = Number(v);
          else if (/^\d+\.\d+$/.test(v)) row[k] = Number(v);
        }
        batch.push(row);
        if (batch.length >= BATCH) {
          const b = batch; batch = [];
          coll.insertMany(b, { ordered: false }).then(() => {
            inserted += b.length;
          }).catch(err => {
            // continue on dup/parse issues
            console.warn(`Insert warning for ${table}:`, err?.code || err?.message);
          });
        }
      })
      .on("end", async () => {
        if (batch.length) {
          try {
            await coll.insertMany(batch, { ordered: false });
            inserted += batch.length;
          } catch (e: any) {
            console.warn(`Final insert warning for ${table}:`, e?.code || e?.message);
          }
        }
        resolve();
      });
  });

  // Helpful indexes (adjust once we inspect DDL)
  const idxPromises: Promise<any>[] = [];
  const hasVin = await coll.findOne({ VIN: { $exists: true } });
  if (hasVin) idxPromises.push(coll.createIndex({ VIN: 1 }));
  const hasYear = await coll.findOne({ ModelYear: { $exists: true } });
  if (hasYear) idxPromises.push(coll.createIndex({ ModelYear: 1 }));
  // Composite example (common in VINBasic): VIN + ModelYear
  if (hasVin && hasYear) idxPromises.push(coll.createIndex({ VIN: 1, ModelYear: 1 }, { unique: false }));

  await Promise.all(idxPromises);

  // Swap: drop live, rename staging -> live (atomic rename)
  const liveExists = await db.listCollections({ name: collLive }).toArray();
  if (liveExists.length) await db.collection(collLive).drop();
  await db.collection(collStage).rename(collLive, { dropTarget: true });

  return { table, inserted };
}

async function main() {
  await ensureDirs();
  const { zipLocal, ddlLocal } = await downloadLatestFiles();
  console.log("Downloaded:", { zipLocal, ddlLocal });

  await extractZip(zipLocal, DATAONE_EXTRACT_DIR!);
  const files = fs.readdirSync(DATAONE_EXTRACT_DIR!)
    .filter(f => f.toLowerCase().endsWith(".csv"))
    .map(f => path.join(DATAONE_EXTRACT_DIR!, f));

  const client = new MongoClient(MONGODB_URI!);
  await client.connect();
  try {
    const limit = pLimit(2); // parallelism without hammering memory
    const results = await Promise.all(files.map(f => limit(() => importCsvToMongo(f, client))));
    console.table(results);
  } finally {
    await client.close();
  }

  console.log("DataOne import complete.");
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
