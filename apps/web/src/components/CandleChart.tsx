"use client";

import { useEffect, useRef, useCallback } from "react";
import {
  createChart,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type Time,
  ColorType,
  CrosshairMode,
} from "lightweight-charts";

export type CandleItem = {
  ts: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
};

type Props = {
  marketId: string | null;
  /** Polling interval in ms for new candles */
  pollMs?: number;
  height?: number;
};

// ── Theme tokens (read from CSS vars at mount time) ──────────────────
function getCssVar(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

export function CandleChart({ marketId, pollMs = 5000, height = 400 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastTsRef = useRef<string | null>(null);

  const fetchCandles = useCallback(
    async (limit = 120) => {
      if (!marketId) return [];
      try {
        const res = await fetch(
          `/api/exchange/marketdata/candles?market_id=${marketId}&interval=1m&limit=${limit}`,
        );
        if (!res.ok) return [];
        const data = await res.json();
        return (data.candles ?? []) as CandleItem[];
      } catch {
        return [];
      }
    },
    [marketId],
  );

  // Convert API candle to lightweight-charts format
  const toChartCandle = (c: CandleItem): CandlestickData<Time> => ({
    time: (Math.floor(new Date(c.ts).getTime() / 1000)) as Time,
    open: parseFloat(c.open),
    high: parseFloat(c.high),
    low: parseFloat(c.low),
    close: parseFloat(c.close),
  });

  const toVolumeBar = (c: CandleItem) => {
    const o = parseFloat(c.open);
    const cl = parseFloat(c.close);
    return {
      time: (Math.floor(new Date(c.ts).getTime() / 1000)) as Time,
      value: parseFloat(c.volume),
      color: cl >= o ? "rgba(52, 211, 153, 0.3)" : "rgba(248, 113, 113, 0.3)",
    };
  };

  // Initialize chart
  useEffect(() => {
    if (!containerRef.current) return;

    const bg = getCssVar("--card", "#0f1724");
    const text = getCssVar("--muted", "#8b9ab8");
    const border = getCssVar("--border", "rgba(148,163,194,0.10)");
    const upColor = getCssVar("--up", "#34d399");
    const downColor = getCssVar("--down", "#f87171");

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height,
      layout: {
        background: { type: ColorType.Solid, color: bg },
        textColor: text,
        fontFamily: "var(--font-mono), monospace",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: border },
        horzLines: { color: border },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "rgba(59,130,246,0.3)", labelBackgroundColor: "#3b82f6" },
        horzLine: { color: "rgba(59,130,246,0.3)", labelBackgroundColor: "#3b82f6" },
      },
      rightPriceScale: {
        borderColor: border,
        scaleMargins: { top: 0.1, bottom: 0.25 },
      },
      timeScale: {
        borderColor: border,
        timeVisible: true,
        secondsVisible: false,
      },
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor,
      downColor,
      borderUpColor: upColor,
      borderDownColor: downColor,
      wickUpColor: upColor,
      wickDownColor: downColor,
    });

    const volumeSeries = chart.addHistogramSeries({
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
    });

    chart.priceScale("volume").applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;

    // Resize observer
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        chart.applyOptions({ width: entry.contentRect.width });
      }
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
    };
  }, [height]);

  // Load data + start polling when marketId changes
  useEffect(() => {
    if (!marketId || !candleSeriesRef.current) return;

    let active = true;
    lastTsRef.current = null;

    // Initial load
    (async () => {
      const candles = await fetchCandles(200);
      if (!active || !candleSeriesRef.current || !volumeSeriesRef.current) return;
      if (candles.length === 0) return;

      const chartCandles = candles.map(toChartCandle);
      const volumeBars = candles.map(toVolumeBar);

      candleSeriesRef.current.setData(chartCandles);
      volumeSeriesRef.current.setData(volumeBars);
      chartRef.current?.timeScale().fitContent();

      lastTsRef.current = candles[candles.length - 1]!.ts;
    })();

    // Polling for new candles
    pollRef.current = setInterval(async () => {
      if (!active) return;
      const candles = await fetchCandles(5);
      if (!active || !candleSeriesRef.current || !volumeSeriesRef.current) return;

      for (const c of candles) {
        candleSeriesRef.current.update(toChartCandle(c));
        volumeSeriesRef.current.update(toVolumeBar(c));
      }

      if (candles.length > 0) {
        lastTsRef.current = candles[candles.length - 1]!.ts;
      }
    }, pollMs);

    return () => {
      active = false;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [marketId, fetchCandles, pollMs]);

  if (!marketId) {
    return (
      <div
        className="flex items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--card)] text-sm text-[var(--muted)]"
        style={{ height }}
      >
        Select a market to view chart
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="overflow-hidden rounded-xl border border-[var(--border)]"
      style={{ height }}
    />
  );
}
