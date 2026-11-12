"use client";

import Link from "next/link";
import { WidgetIcon } from "@/components/icons";
import { useDevice } from "@/components/use-device";

/** The "Widget" button in the countdown page header; nothing on iPhones and iPads (no widget there yet). */
export function WidgetLink() {
  if (useDevice() === "iphone") return null;
  return (
    <Link href="/countdown/settings" title="Show your countdowns on your home screen" className="btn btn-ghost">
      <WidgetIcon width={18} height={18} />
      Widget
    </Link>
  );
}
