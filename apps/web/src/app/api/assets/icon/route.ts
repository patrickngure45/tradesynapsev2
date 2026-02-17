import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";

declare global {
  // Cache SVG bodies by lowercase filename (e.g. btc.svg). Empty string means "missing".
  // eslint-disable-next-line no-var
  var __assetIconSvgCache: Map<string, string> | undefined;
}

function cleanSymbol(value: string | null): string {
  return String(value ?? "")
    .trim()
    .toUpperCase();
}

function findIconsDir(): string {
  // Resolve relative to the built output location.
  // In dev/build, process.cwd() should be apps/web.
  return path.join(process.cwd(), "node_modules", "cryptocurrency-icons", "svg", "color");
}

function getCache(): Map<string, string> {
  if (!globalThis.__assetIconSvgCache) globalThis.__assetIconSvgCache = new Map();
  return globalThis.__assetIconSvgCache;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const symbol = cleanSymbol(url.searchParams.get("symbol"));
  if (!symbol) {
    return NextResponse.json({ error: "missing_symbol" }, { status: 400 });
  }

  // Package uses lowercase filenames.
  const filename = `${symbol.toLowerCase()}.svg`;
  const cache = getCache();
  const cached = cache.get(filename);
  if (cached !== undefined) {
    if (!cached) return new NextResponse("", { status: 404 });
    return new NextResponse(cached, {
      status: 200,
      headers: {
        "content-type": "image/svg+xml; charset=utf-8",
        "cache-control": "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800",
      },
    });
  }

  const iconPath = path.join(findIconsDir(), filename);

  try {
    const svg = await fs.readFile(iconPath, "utf8");
    cache.set(filename, svg);
    return new NextResponse(svg, {
      status: 200,
      headers: {
        "content-type": "image/svg+xml; charset=utf-8",
        // Cache aggressively; icons change rarely.
        "cache-control": "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800",
      },
    });
  } catch {
    cache.set(filename, "");
    return new NextResponse("", { status: 404 });
  }
}
