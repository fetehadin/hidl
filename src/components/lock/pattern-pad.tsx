"use client";

import { useRef, useState } from "react";
import { PATTERN_MIN, addPatternPoint } from "@/lib/app-lock";

const SIZE = 264;
const GAP = SIZE / 3;
const center = (i: number) => ({ x: (i % 3) * GAP + GAP / 2, y: Math.floor(i / 3) * GAP + GAP / 2 });
/** How close (px) the finger must come to a dot to join it. */
const HIT = 30;

/**
 * A 3×3 pattern grid: drag across the dots (finger or mouse). The dots are also buttons, so it
 * works by tapping them in order, or with a keyboard (Tab + Enter), then "Done".
 * `resetKey` clears it (after a wrong try).
 */
export function PatternPad({
  onComplete,
  disabled = false,
  resetKey = 0,
  error = false,
}: {
  onComplete: (points: number[]) => void;
  disabled?: boolean;
  resetKey?: number;
  error?: boolean;
}) {
  const [points, setPoints] = useState<number[]>([]);
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const [lastReset, setLastReset] = useState(resetKey);
  const [dragging, setDragging] = useState(false);
  const svg = useRef<SVGSVGElement>(null);
  if (resetKey !== lastReset) {
    setLastReset(resetKey);
    setPoints([]);
  }

  function local(e: React.PointerEvent) {
    const r = svg.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * SIZE, y: ((e.clientY - r.top) / r.height) * SIZE };
  }
  function hit(p: { x: number; y: number }) {
    for (let i = 0; i < 9; i++) {
      const c = center(i);
      if (Math.hypot(c.x - p.x, c.y - p.y) <= HIT) return i;
    }
    return -1;
  }

  function down(e: React.PointerEvent) {
    if (disabled) return;
    const p = local(e);
    const i = hit(p);
    if (i < 0) return;
    e.preventDefault();
    svg.current!.setPointerCapture(e.pointerId);
    setDragging(true);
    setPoints([i]);
    setPointer(p);
  }
  function move(e: React.PointerEvent) {
    if (!dragging) return;
    const p = local(e);
    setPointer(p);
    const i = hit(p);
    if (i >= 0) setPoints((pts) => addPatternPoint(pts, i));
  }
  function up() {
    if (!dragging) return;
    setDragging(false);
    setPointer(null);
    // A single dot touched and released is a tap: keep building the pattern tap by tap.
    if (points.length === 1) return;
    if (points.length >= PATTERN_MIN) onComplete(points);
    else setPoints([]);
  }
  function tap(i: number) {
    if (disabled) return;
    setPoints((pts) => addPatternPoint(pts, i));
  }

  const last = points.at(-1);
  const stroke = error ? "var(--wax)" : "var(--teal)";

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative" style={{ width: SIZE, height: SIZE }}>
        <svg
          ref={svg}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          width={SIZE}
          height={SIZE}
          className="absolute inset-0 touch-none select-none"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          aria-hidden
        >
          {points.length > 1 && (
            <polyline
              points={points.map((i) => `${center(i).x},${center(i).y}`).join(" ")}
              fill="none"
              stroke={stroke}
              strokeWidth={6}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.7}
            />
          )}
          {pointer && last !== undefined && (
            <line x1={center(last).x} y1={center(last).y} x2={pointer.x} y2={pointer.y} stroke={stroke} strokeWidth={6} strokeLinecap="round" opacity={0.4} />
          )}
          {Array.from({ length: 9 }, (_, i) => {
            const c = center(i);
            const on = points.includes(i);
            return (
              <g key={i}>
                <circle cx={c.x} cy={c.y} r={24} fill={on ? "var(--mint)" : "transparent"} />
                <circle cx={c.x} cy={c.y} r={on ? 11 : 8} fill={on ? stroke : "var(--aqua)"} />
              </g>
            );
          })}
        </svg>
        {/* Invisible buttons over the dots, for taps and keyboards (the drag is pointer-only). */}
        <div className="pointer-events-none absolute inset-0 grid grid-cols-3">
          {Array.from({ length: 9 }, (_, i) => (
            <button
              key={i}
              type="button"
              disabled={disabled}
              onClick={(e) => e.detail === 0 && tap(i)}
              aria-label={`Dot ${i + 1}${points.includes(i) ? `, number ${points.indexOf(i) + 1} in the pattern` : ""}`}
              className="pointer-events-none m-auto size-14 rounded-full opacity-0 focus-visible:pointer-events-auto focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-teal"
            />
          ))}
        </div>
      </div>
      <div className="flex h-10 items-center gap-3">
        {points.length > 0 && !dragging && (
          <>
            <button type="button" className="text-sm font-bold text-muted hover:text-ocean" onClick={() => setPoints([])} disabled={disabled}>
              Clear
            </button>
            {points.length >= PATTERN_MIN && (
              <button type="button" className="btn btn-primary min-h-10 px-4 text-sm" onClick={() => onComplete(points)} disabled={disabled}>
                Done
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
