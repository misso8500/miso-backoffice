import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { loadEnv } from "../load-env.mjs";

const { Client } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "../..");

loadEnv(rootDir);

const databaseUrl = process.env.DATABASE_URL;
const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, "");
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;

if (supabaseUrl && publishableKey) {
  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/settings`, {
      headers: { apikey: publishableKey }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    console.log("Supabase API connection successful.");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Supabase API connection failed: ${message}`);
    process.exitCode = 1;
  }
} else {
  console.error("SUPABASE_URL 또는 SUPABASE_PUBLISHABLE_KEY가 없습니다.");
  process.exitCode = 1;
}

if (!databaseUrl) {
  console.error(
    "Supabase API 설정은 확인할 수 있지만 백엔드 DB 연결용 DATABASE_URL이 없습니다. Supabase Connect 화면의 Postgres 연결 문자열을 .env.local에 추가하세요."
  );
  process.exitCode = 1;
} else {
  const client = new Client({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 10000,
    ssl:
      process.env.PGSSLMODE === "require" || databaseUrl.includes("sslmode=require")
        ? { rejectUnauthorized: false }
        : undefined
  });

  try {
    await client.connect();
    const { rows } = await client.query(
      "SELECT current_database() AS database, current_user AS \"user\", NOW() AS \"serverTime\""
    );
    console.log("Supabase database connection successful.");
    console.table(rows);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Supabase database connection failed: ${message}`);
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => undefined);
  }
}
