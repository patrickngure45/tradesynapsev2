type Check = {
  name: string;
  path: string;
  expectStatus: number | number[];
  validate?: (json: unknown) => string | null;
};

function normalizeBaseUrl(raw: string): string {
  const cleaned = raw.trim().replace(/\/+$/, "");
  if (!cleaned) throw new Error("BASE_URL is required. Example: https://coinwaka.com");
  const url = new URL(cleaned);
  if (url.protocol !== "https:") {
    throw new Error("BASE_URL must be https for production smoke checks.");
  }
  return `${url.protocol}//${url.host}`;
}

function matchesStatus(actual: number, expected: number | number[]) {
  if (Array.isArray(expected)) return expected.includes(actual);
  return actual === expected;
}

async function runCheck(baseUrl: string, check: Check): Promise<void> {
  const target = `${baseUrl}${check.path}`;
  const response = await fetch(target, {
    method: "GET",
    headers: { "accept": "application/json" },
  });

  if (!matchesStatus(response.status, check.expectStatus)) {
    throw new Error(`${check.name}: expected status ${JSON.stringify(check.expectStatus)} but got ${response.status}`);
  }

  if (!check.validate) {
    console.log(`✅ ${check.name} (${response.status})`);
    return;
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new Error(`${check.name}: expected JSON response`);
  }

  const validationError = check.validate(json);
  if (validationError) throw new Error(`${check.name}: ${validationError}`);

  console.log(`✅ ${check.name} (${response.status})`);
}

function asObj(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") return {};
  return value as Record<string, unknown>;
}

async function main() {
  const rawBase = process.env.BASE_URL ?? process.argv[2] ?? "";
  const baseUrl = normalizeBaseUrl(rawBase);

  console.log(`\n=== Post-deploy smoke checks: ${baseUrl} ===\n`);

  const checks: Check[] = [
    {
      name: "System version endpoint",
      path: "/api/system/version",
      expectStatus: 200,
      validate: (json) => {
        const obj = asObj(json);
        if (obj.ok !== true) return "ok flag is not true";
        if (String(obj.node_env ?? "") !== "production") return "node_env is not production";
        return null;
      },
    },
    {
      name: "Status endpoint",
      path: "/api/status",
      expectStatus: 200,
      validate: (json) => {
        const obj = asObj(json);
        if (obj.ok !== true) return "ok flag is not true";
        const overall = String(obj.overall ?? "");
        if (!["online", "degraded", "offline"].includes(overall)) return `unexpected overall value: ${overall}`;
        return null;
      },
    },
    {
      name: "Dev endpoint blocked in prod",
      path: "/api/dev/whoami",
      expectStatus: [401, 403, 404],
    },
    {
      name: "Cron endpoint rejects unauthenticated call",
      path: "/api/exchange/cron/sweep-deposits?tokens=0",
      expectStatus: [401, 403, 429, 500],
    },
  ];

  for (const check of checks) {
    await runCheck(baseUrl, check);
  }

  console.log("\n✅ Post-deploy smoke checks passed.\n");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`❌ ${message}`);
  process.exit(1);
});
