import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { loadEnv } from "../load-env.mjs";

const { Client } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "../..");
const schemaPath = join(__dirname, "schema.sql");

loadEnv(rootDir);

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("Supabase DATABASE_URL 환경 변수를 설정하세요.");
  process.exit(1);
}

const client = new Client({
  connectionString: databaseUrl,
  ssl:
    process.env.PGSSLMODE === "require" || databaseUrl.includes("sslmode=require")
      ? { rejectUnauthorized: false }
      : undefined
});

try {
  await client.connect();
  await client.query(readFileSync(schemaPath, "utf8"));
  console.log("Supabase schema initialized.");
} finally {
  await client.end();
}
