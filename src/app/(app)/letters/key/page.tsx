import type { Metadata } from "next";
import { LetterKeyLink } from "@/components/letters/letter-key";
import { getKeyBundle, getLetterPasskeys } from "@/lib/data/letter-keys";
import { requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Unlock letters", robots: { index: false } };

/**
 * Where the button in the "Your hidl letter key" email lands. The key is in the #fragment,
 * which never reaches this server: LetterKeyLink reads it in the browser and unlocks there.
 */
export default async function LetterKeyPage() {
  const { supabase, user } = await requireUser();
  const [bundle, passkeys] = await Promise.all([getKeyBundle(supabase), getLetterPasskeys(supabase)]);
  return (
    <div className="pt-6">
      <LetterKeyLink user={{ id: user.id, email: user.email ?? "" }} bundle={bundle} passkeys={passkeys} />
    </div>
  );
}
