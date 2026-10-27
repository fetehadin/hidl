import Link from "next/link";

export default function LetterNotFound() {
  return (
    <div className="card mt-6 p-8 text-center">
      <p className="font-display text-2xl">No such letter.</p>
      <p className="mt-1 text-ink-soft">It may have been deleted.</p>
      <Link href="/letters" className="btn btn-ghost mt-5">Back to letters</Link>
    </div>
  );
}
