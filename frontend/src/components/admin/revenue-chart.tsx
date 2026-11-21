"use client";

import { X } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { cn } from "@/lib/cn";

/**
 * Revenue per day / month as grouped columns (GĐ5.7, DECISIONS #36): real money (gold) and Demo money (jade),
 * never stacked or added. Plain SVG, no chart library. Following the dataviz rules: one axis (on the right), round
 * gridlines, thin columns with 4px rounded tops sitting on the baseline, a 2px gap between the two columns of a
 * period, a legend. Colours: --color-chart-real / --color-chart-demo (validated for both themes in globals.css).
 *
 * User request 2026-11-21: no data table under the chart; tapping (or hovering) a column shows that period's
 * amounts in the panel under the chart, and the axis labels never overlap. The SVG is drawn at the real width of
 * its box (measured), so text stays 11px at any width, and the labels are thinned from the newest period leftwards
 * so each one has room. Keyboard: the periods are one tab stop; arrow keys move, Escape clears.
 */
export type ChartPoint = {
  key: string;
  /** Short axis label ("19/11", "11/26"). */
  label: string;
  /** The period in full ("19 thg 11, 2026"), for the panel and screen readers. */
  period: string;
  /** Screen-reader text for the column: the period and both amounts. */
  aria: string;
  real: number;
  demo: number;
  realText: string;
  demoText: string;
  realOrdersText: string;
  demoOrdersText: string;
};

const H = 240;
// The value axis is on the right: on a narrow screen the chart opens scrolled to the newest periods (right),
// so the axis stays in view next to them.
const PAD = { top: 12, right: 56, bottom: 28, left: 4 };
const PLOT_H = H - PAD.top - PAD.bottom;
const GAP = 2;
const RADIUS = 4;
/** Narrowest drawing: below this the chart scrolls sideways (phones). */
const MIN_W = 520;
/** Roughly the width of one 11px tabular digit / slash, plus the space kept between two labels. */
const CHAR_W = 6.6;
const LABEL_GAP = 12;

/** A column with a rounded top and a square foot on the baseline. */
function columnPath(x: number, y: number, w: number, h: number): string {
  const r = Math.min(RADIUS, w / 2, h);
  const base = y + h;
  return `M${x},${base}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${base}Z`;
}

export function RevenueChart({
  points,
  ticks,
  ariaLabel,
  legend,
  labels,
}: {
  points: ChartPoint[];
  /** Gridlines, bottom (0) to top, with their labels. */
  ticks: { value: number; label: string }[];
  ariaLabel: string;
  legend: { real: string; demo: string };
  labels: { pick: string; close: string; real: string; demo: string };
}) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  const [picked, setPicked] = useState<number | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const [focusAt, setFocusAt] = useState(points.length - 1);
  const slotRefs = useRef<(SVGRectElement | null)[]>([]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(MIN_W, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // A new range (other points) forgets the old choice: adjust during render, not in an effect.
  const [seenPoints, setSeenPoints] = useState(points);
  if (seenPoints !== points) {
    setSeenPoints(points);
    setPicked(null);
    setHovered(null);
    setFocusAt(points.length - 1);
  }

  const W = width;
  const plotW = W - PAD.left - PAD.right;
  const top = ticks[ticks.length - 1]?.value || 1;
  const y = (v: number) => PAD.top + PLOT_H - (v / top) * PLOT_H;
  const slot = plotW / Math.max(1, points.length);
  // Thin columns: at most 14px each, never more than ~70% of the slot for the pair.
  const colW = Math.max(1.5, Math.min(14, (slot * 0.7 - GAP) / 2));
  // Every n-th label, counted from the newest period, so neighbours never touch.
  const longest = Math.max(1, ...points.map((p) => p.label.length));
  const every = Math.max(1, Math.ceil((longest * CHAR_W + LABEL_GAP) / slot));
  const showLabel = (i: number) => (points.length - 1 - i) % every === 0;

  const shown = hovered ?? picked;
  const p = shown !== null ? points[shown] : undefined;

  const move = (i: number) => {
    const next = Math.max(0, Math.min(points.length - 1, i));
    setFocusAt(next);
    setPicked(next);
    slotRefs.current[next]?.focus();
  };
  const onKey = (e: KeyboardEvent, i: number) => {
    if (e.key === "ArrowLeft") move(i - 1);
    else if (e.key === "ArrowRight") move(i + 1);
    else if (e.key === "Home") move(0);
    else if (e.key === "End") move(points.length - 1);
    else if (e.key === "Enter" || e.key === " ") setPicked(picked === i ? null : i);
    else if (e.key === "Escape") setPicked(null);
    else return;
    e.preventDefault();
  };

  return (
    <figure className="flex flex-col gap-3">
      <figcaption
        className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ivory-300"
        data-testid="chart-legend"
      >
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="size-2.5 rounded-sm bg-chart-real" />
          {legend.real}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="size-2.5 rounded-sm bg-chart-demo" />
          {legend.demo}
        </span>
      </figcaption>
      {/* On a narrow screen the chart scrolls sideways; dir="rtl" makes it open at the newest periods (right). */}
      <div ref={box} dir="rtl" className="-mx-1 overflow-x-auto px-1">
        <svg
          style={{ direction: "ltr" }}
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          role="group"
          aria-label={ariaLabel}
          className="block"
          data-testid="revenue-chart"
          onPointerLeave={() => setHovered(null)}
        >
          {ticks.map((t) => (
            <g key={t.value} aria-hidden="true">
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={y(t.value)}
                y2={y(t.value)}
                className={t.value === 0 ? "stroke-bronze-500" : "stroke-bronze-700"}
                strokeWidth={1}
                strokeDasharray={t.value === 0 ? undefined : "3 4"}
              />
              <text
                x={W - PAD.right + 8}
                y={y(t.value)}
                textAnchor="start"
                dominantBaseline="middle"
                className="fill-ivory-500 text-[11px] tabular-nums"
              >
                {t.label}
              </text>
            </g>
          ))}
          {points.map((pt, i) => {
            const cx = PAD.left + slot * i + slot / 2;
            const xReal = cx - GAP / 2 - colW;
            const xDemo = cx + GAP / 2;
            const hReal = (pt.real / top) * PLOT_H;
            const hDemo = (pt.demo / top) * PLOT_H;
            const on = picked === i;
            return (
              <g key={pt.key} data-testid="chart-period" data-key={pt.key} data-real={pt.real} data-demo={pt.demo}>
                {/* Hit target bigger than the columns: the whole slot. */}
                <rect
                  ref={(el) => {
                    slotRefs.current[i] = el;
                  }}
                  x={PAD.left + slot * i}
                  y={PAD.top}
                  width={slot}
                  height={PLOT_H}
                  rx={4}
                  role="button"
                  tabIndex={i === focusAt ? 0 : -1}
                  aria-pressed={on}
                  aria-label={pt.aria}
                  className={cn(
                    "cursor-pointer outline-hidden focus-visible:stroke-gold-400 focus-visible:stroke-2",
                    on ? "fill-gold-500/15" : hovered === i ? "fill-ivory-100/5" : "fill-transparent",
                  )}
                  onPointerEnter={(e) => e.pointerType === "mouse" && setHovered(i)}
                  onClick={() => {
                    setFocusAt(i);
                    setPicked(on ? null : i);
                  }}
                  onKeyDown={(e) => onKey(e, i)}
                  data-testid="chart-slot"
                />
                {hReal > 0 && (
                  <path d={columnPath(xReal, y(pt.real), colW, hReal)} className="pointer-events-none fill-chart-real" />
                )}
                {hDemo > 0 && (
                  <path d={columnPath(xDemo, y(pt.demo), colW, hDemo)} className="pointer-events-none fill-chart-demo" />
                )}
                {showLabel(i) && (
                  <text
                    x={cx}
                    y={H - 8}
                    textAnchor="middle"
                    aria-hidden="true"
                    className={cn("text-[11px] tabular-nums", on ? "fill-gold-300 font-semibold" : "fill-ivory-500")}
                  >
                    {pt.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* The chosen (or hovered) period. Fixed height so the page does not jump when it fills. */}
      <div
        aria-live="polite"
        className={cn(
          "flex min-h-[4.5rem] items-center rounded-xl border px-4 py-3",
          p ? "border-bronze-600 bg-ink-850" : "border-dashed border-bronze-700",
        )}
        data-testid="chart-detail"
        data-key={p?.key}
      >
        {p ? (
          <div className="flex w-full flex-wrap items-start gap-x-8 gap-y-2">
            <p className="w-full text-sm font-medium text-ivory-100 sm:w-auto sm:min-w-36" data-testid="chart-detail-period">
              {p.period}
            </p>
            <dl className="flex flex-1 flex-wrap gap-x-8 gap-y-2">
              <div className="flex flex-col gap-0.5">
                <dt className="flex items-center gap-1.5 text-xs text-ivory-300">
                  <span aria-hidden="true" className="size-2.5 rounded-sm bg-chart-real" />
                  {labels.real}
                </dt>
                <dd className="text-base font-semibold text-ivory-100 tabular-nums" data-testid="chart-detail-real">
                  {p.realText}
                </dd>
                <dd className="text-xs text-ivory-500">{p.realOrdersText}</dd>
              </div>
              <div className="flex flex-col gap-0.5">
                <dt className="flex items-center gap-1.5 text-xs text-ivory-300">
                  <span aria-hidden="true" className="size-2.5 rounded-sm bg-chart-demo" />
                  {labels.demo}
                </dt>
                <dd className="text-base font-semibold text-ivory-100 tabular-nums" data-testid="chart-detail-demo">
                  {p.demoText}
                </dd>
                <dd className="text-xs text-ivory-500">{p.demoOrdersText}</dd>
              </div>
            </dl>
            {picked !== null && hovered === null && (
              <button
                type="button"
                onClick={() => setPicked(null)}
                aria-label={labels.close}
                title={labels.close}
                className="-m-1 grid size-8 shrink-0 cursor-pointer place-items-center rounded-lg text-ivory-500 hover:bg-ivory-100/5 hover:text-ivory-100"
                data-testid="chart-detail-close"
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            )}
          </div>
        ) : (
          <p className="text-sm text-pretty text-ivory-500" data-testid="chart-hint">
            {labels.pick}
          </p>
        )}
      </div>
    </figure>
  );
}
