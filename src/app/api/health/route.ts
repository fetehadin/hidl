import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Liveness check for the container healthcheck and uptime monitors. No data, no auth. */
export function GET() {
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
