import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const parseEnv = (relativePath) => {
  const fullPath = resolve(process.cwd(), relativePath);
  if (!existsSync(fullPath)) return new Map();
  const result = new Map();
  const contents = readFileSync(fullPath, "utf8");
  contents.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const match = trimmed.match(/^(?:export\s+)?([A-Za-z0-9_\.\-]+)\s*=\s*(.*)$/);
    if (!match) return;
    const [, key, value = ""] = match;
    result.set(key, value.replace(/^['"]|['"]$/g, ""));
  });
  return result;
};

const files = new Map([
  ["root", parseEnv(".env.local")],
  ["web", parseEnv("apps/doWhat-web/.env.local")],
  ["mobile", parseEnv("apps/doWhat-mobile/.env.local")],
]);

const keys = [
  "SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
];

for (const key of keys) {
  const values = [];
  for (const [label, map] of files.entries()) {
    if (map.has(key)) {
      values.push({ label, value: map.get(key) });
    }
  }
  if (!values.length) {
    console.log(`${key}: missing everywhere`);
    continue;
  }
  const unique = new Set(values.map(({ value }) => value));
  const status = unique.size === 1 ? "identical" : `different (${unique.size} distinct)`;
  const locations = values.map(({ label }) => label).join(", ");
  console.log(`${key}: ${status} across [${locations}]`);
}
