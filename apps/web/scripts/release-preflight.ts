import { spawnSync } from "node:child_process";

function fail(message: string): never {
  console.error(`❌ ${message}`);
  process.exit(1);
}

function warn(message: string) {
  console.warn(`⚠️  ${message}`);
}

function ok(message: string) {
  console.log(`✅ ${message}`);
}

function run(command: string, args: string[]) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: process.env,
  });

  if (result.status !== 0) {
    fail(`${command} ${args.join(" ")} failed with exit code ${result.status ?? "unknown"}`);
  }
}

function requireEnv(name: string, opts?: { minLen?: number }) {
  const raw = String(process.env[name] ?? "").trim();
  if (!raw) fail(`${name} is required for production readiness.`);
  if (opts?.minLen && raw.length < opts.minLen) {
    fail(`${name} is too short. Expected at least ${opts.minLen} characters.`);
  }
  ok(`${name} is set`);
}

function validateBaseUrl() {
  const raw = String(process.env.NEXT_PUBLIC_BASE_URL ?? "").trim();
  if (!raw) fail("NEXT_PUBLIC_BASE_URL is required.");

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    fail("NEXT_PUBLIC_BASE_URL must be a valid URL.");
  }

  if (url.protocol !== "https:") {
    fail("NEXT_PUBLIC_BASE_URL must use https in production.");
  }

  if (url.hostname === "localhost" || url.hostname.endsWith(".local")) {
    fail("NEXT_PUBLIC_BASE_URL cannot point to localhost/.local in production.");
  }

  ok("NEXT_PUBLIC_BASE_URL is a valid production URL");
}

function validateSafetyFlags() {
  const runSeedProd = String(process.env.RUN_SEED_PROD ?? "").trim().toLowerCase();
  if (runSeedProd === "1" || runSeedProd === "true") {
    fail("RUN_SEED_PROD must be disabled for production push.");
  }
  ok("RUN_SEED_PROD is disabled");

  const useMainnet = String(process.env.NEXT_PUBLIC_USE_MAINNET ?? "").trim().toLowerCase();
  if (useMainnet === "0" || useMainnet === "false") {
    fail("NEXT_PUBLIC_USE_MAINNET indicates testnet. Refusing release preflight.");
  }
  ok("NEXT_PUBLIC_USE_MAINNET is mainnet-compatible");
}

function validateCronConfig() {
  const cronSecret = String(process.env.EXCHANGE_CRON_SECRET ?? process.env.CRON_SECRET ?? "").trim();
  if (!cronSecret) {
    fail("Missing cron secret. Set EXCHANGE_CRON_SECRET (or CRON_SECRET).");
  }
  if (cronSecret.length < 32) {
    fail("Cron secret is too short. Use at least 32 random characters.");
  }
  ok("Cron secret configured");

  const exchangeAllowlist = String(process.env.EXCHANGE_CRON_ALLOWED_IPS ?? "").trim();
  const globalAllowlist = String(process.env.CRON_ALLOWED_IPS ?? "").trim();
  if (!exchangeAllowlist && !globalAllowlist) {
    warn("Cron IP allowlist is not set (EXCHANGE_CRON_ALLOWED_IPS / CRON_ALLOWED_IPS). Secret-only mode is active.");
  } else {
    ok("Cron IP allowlist configured");
  }
}

function validateGitTree() {
  const result = spawnSync("git", ["status", "--porcelain"], {
    encoding: "utf8",
    shell: process.platform === "win32",
  });

  if (result.status !== 0) {
    warn("Unable to verify git working tree cleanliness.");
    return;
  }

  const output = String(result.stdout ?? "").trim();
  if (output.length > 0) {
    warn("Working tree is not clean. Review staged/unstaged files before pushing.");
  } else {
    ok("Git working tree is clean");
  }
}

function main() {
  console.log("\n=== Release Preflight (funds-safe gate) ===\n");

  requireEnv("DATABASE_URL");
  requireEnv("PROOFPACK_SESSION_SECRET", { minLen: 32 });
  requireEnv("CITADEL_MASTER_SEED", { minLen: 16 });
  requireEnv("DEPLOYER_PRIVATE_KEY", { minLen: 32 });
  validateBaseUrl();
  validateSafetyFlags();
  validateCronConfig();
  validateGitTree();

  console.log("\n=== Code quality gates ===\n");
  run("npm", ["run", "lint"]);
  run("npm", ["run", "build"]);

  const runTests = String(process.env.RELEASE_RUN_TESTS ?? "").trim() === "1";
  if (runTests) {
    run("npm", ["run", "test"]);
  } else {
    warn("Skipping tests (set RELEASE_RUN_TESTS=1 to enforce).\n");
  }

  console.log("\n✅ Release preflight passed.\n");
}

main();
