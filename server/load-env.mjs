import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const loadEnv = (rootDir) => {
  const externallyConfiguredKeys = new Set(Object.keys(process.env));

  // Later files have higher priority, matching the common local-env convention.
  for (const fileName of [".env", ".env.local"]) {
    const envPath = join(rootDir, fileName);

    if (!existsSync(envPath)) {
      continue;
    }

    for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const trimmedLine = line.trim();

      if (!trimmedLine || trimmedLine.startsWith("#")) {
        continue;
      }

      const separatorIndex = trimmedLine.indexOf("=");

      if (separatorIndex <= 0) {
        continue;
      }

      const key = trimmedLine.slice(0, separatorIndex).trim();
      const rawValue = trimmedLine.slice(separatorIndex + 1).trim();
      const value = rawValue.replace(/^['"]|['"]$/g, "");

      if (!externallyConfiguredKeys.has(key)) {
        process.env[key] = value;
      }
    }
  }
};
