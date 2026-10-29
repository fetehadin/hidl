import Link from "next/link";

export default function CountdownNotFound() {
  return (
    <div className="card mt-6 p-8 text-center">
      <p className="font-display text-2xl">No such countdown.</p>
      <p className="mt-1 text-ink-soft">It may have been deleted.</p>
      <Link href="/countdown" className="btn btn-ghost mt-5">Back to countdowns</Link>
    </div>
  );
}
