import "dotenv/config";

import { spawn, type ChildProcess } from "node:child_process";

function envBool(name: string, fallback: boolean): boolean {
  const raw = String(process.env[name] ?? "").trim().toLowerCase();
  if (!raw) return fallback;
  return raw === "1" || raw === "true" || raw === "yes";
}

function npmCmd(): string {
  // On Windows, spawn needs npm.cmd to resolve correctly.
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function killTree(child: ChildProcess, signal: NodeJS.Signals = "SIGTERM") {
  if (!child.pid) return;
  try {
    child.kill(signal);
  } catch {
    // ignore
  }
}

async function main() {
  const startDepositWatcher = envBool("START_DEPOSIT_WATCHER", true);

  const children: ChildProcess[] = [];

  const run = (label: string, args: string[], extraEnv?: Record<string, string>) => {
    const child = spawn(npmCmd(), args, {
      stdio: "inherit",
      env: {
        ...process.env,
        ...(extraEnv ?? {}),
      },
    });

    children.push(child);

    child.on("exit", (code, signal) => {
      const exitCode = typeof code === "number" ? code : 0;
      console.log(`[dev:all] ${label} exited code=${exitCode} signal=${signal ?? ""}`);

      // If any child exits, stop everything else.
      for (const c of children) {
        if (c === child) continue;
        killTree(c, "SIGTERM");
      }

      process.exit(exitCode);
    });

    return child;
  };

  console.log(`[dev:all] starting (depositWatcher=${startDepositWatcher ? "on" : "off"})`);

  // Web app (webpack dev for stability)
  run("web", ["run", "dev"]);

  // Deposit watcher (optional but recommended for wallet UX)
  if (startDepositWatcher) {
    run("deposit:watch:bsc", ["run", "deposit:watch:bsc"], {
      // Default to pending-credit UX in dev-all.
      DEPOSIT_PENDING_CREDIT: process.env.DEPOSIT_PENDING_CREDIT ?? "1",
      DEPOSIT_CONFIRMATIONS: process.env.DEPOSIT_CONFIRMATIONS ?? "3",
      DEPOSIT_SCAN_POLL_MS: process.env.DEPOSIT_SCAN_POLL_MS ?? "10000",
      // Keep reorg checks conservative in dev to avoid too much RPC load.
      DEPOSIT_REORG_WINDOW_BLOCKS: process.env.DEPOSIT_REORG_WINDOW_BLOCKS ?? "24",
    });
  }

  const shutdown = () => {
    console.log("\n[dev:all] shutting down...");
    for (const c of children) killTree(c, "SIGTERM");
    setTimeout(() => process.exit(0), 1000);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((e) => {
  console.error("[dev:all] fatal:", e);
  process.exit(1);
});
