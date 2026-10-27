export default function Loading() {
  return (
    <div className="animate-pulse pt-4" aria-busy="true" aria-label="Loading">
      <div className="mb-2 h-4 w-32 rounded bg-paper-deep" />
      <div className="mb-6 h-9 w-56 rounded bg-paper-deep" />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="h-40 rounded-2xl bg-paper-deep sm:col-span-2" />
        <div className="h-56 rounded-2xl bg-paper-deep" />
        <div className="h-56 rounded-2xl bg-paper-deep" />
      </div>
    </div>
  );
}
