import fs from "node:fs";
import path from "node:path";

const root = path.join(process.cwd(), "src", "app", "api");

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (ent.isFile() && ent.name === "route.ts") out.push(p);
  }
  return out;
}

function hasMutatingExport(src) {
  return /export\s+async\s+function\s+(POST|PUT|PATCH|DELETE)\s*\(/.test(src);
}

function methods(src) {
  const ms = [];
  for (const m of src.matchAll(/export\s+async\s+function\s+(POST|PUT|PATCH|DELETE)\s*\(/g)) ms.push(m[1]);
  return [...new Set(ms)];
}

function classify(src) {
  const hasPgLimiter = /createPgRateLimiter|PgRateLimiter/.test(src);
  const hasSharedSecurityLimiter = /enforceAccountSecurityRateLimit/.test(src);
  const hasAdminGuardLimiter = /requireAdminForApi\s*\(/.test(src);
  const hasLimiterConsume = /\b(?:limiter|rate)[a-zA-Z0-9_]*\s*\.\s*consume\(/.test(src);
  const hasRateError = /rate_limit_exceeded|rate_limited/.test(src);
  const hasBusinessCap =
    /Already claimed|already used today|cooldown|once per day|23505|UNIQUE|daily limit|weekly limit/i.test(src);

  if (hasPgLimiter || hasSharedSecurityLimiter || hasAdminGuardLimiter || hasLimiterConsume) return "route_limiter";
  if (hasRateError || hasBusinessCap) return "business_limit_only";
  return "global_proxy_only";
}

const files = walk(root);
const rows = [];

for (const file of files) {
  const src = fs.readFileSync(file, "utf8");
  if (!hasMutatingExport(src)) continue;
  const rel = path.relative(process.cwd(), file).replace(/\\/g, "/");
  rows.push({ file: rel, methods: methods(src).join(","), coverage: classify(src) });
}

rows.sort((a, b) => a.file.localeCompare(b.file));

const grouped = rows.reduce((acc, row) => {
  (acc[row.coverage] ||= []).push(row);
  return acc;
}, {});

console.log(`mutating_routes=${rows.length}`);
for (const key of ["route_limiter", "business_limit_only", "global_proxy_only"]) {
  const list = grouped[key] ?? [];
  console.log(`\n[${key}] ${list.length}`);
  for (const row of list) console.log(`${row.methods.padEnd(16)} ${row.file}`);
}
