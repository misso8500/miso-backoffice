import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "./load-env.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");

loadEnv(rootDir);

if (!process.env.DATABASE_URL) {
  console.error(
    "Supabase DATABASE_URL이 설정되지 않았습니다. .env.example을 참고해 .env를 만든 뒤 npm run supabase:check를 실행하세요.\n" +
      "SQLite를 명시적으로 사용하려면 npm run api:sqlite를 실행하세요."
  );
  process.exit(1);
}

await import("./postgres/api.mjs");
