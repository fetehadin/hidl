import Link from "next/link";
import { Mascot } from "@/components/mascot";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center px-6 text-center">
      <Mascot mood="curious" size={120} />
      <p className="eyebrow mt-4 mb-2">lost page</p>
      <h1 className="font-display text-3xl font-semibold">Nothing written here.</h1>
      <Link href="/" className="btn btn-primary mt-6">
        Back to today
      </Link>
    </main>
  );
}
