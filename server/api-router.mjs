import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "./load-env.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");

loadEnv(rootDir);

if (process.env.DATABASE_URL) {
  await import("./postgres/api.mjs");
} else {
  await import("./api.mjs");
}
