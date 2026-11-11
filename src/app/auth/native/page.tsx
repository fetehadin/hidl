import type { Metadata } from "next";
import { Mascot } from "@/components/mascot";
import { NativeHandoff } from "./native-handoff";

export const metadata: Metadata = { title: "Signing in", robots: { index: false } };

/**
 * Where the phone app's web view lands right after the person signs in natively. The app puts
 * the session in the URL fragment (never sent to any server); NativeHandoff stores it as this
 * web view's cookies and moves on to the journal. Signing in once covers the whole app.
 */
export default function NativeSignInPage() {
  return (
    <main className="grid min-h-dvh place-items-center px-6">
      <div className="flex flex-col items-center gap-4 text-center">
        <Mascot mood="wave" size={120} />
        <p className="font-display text-2xl font-semibold text-heading">Opening your journal…</p>
        <NativeHandoff />
      </div>
    </main>
  );
}
