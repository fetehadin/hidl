export default function Loading() {
  return (
    <div className="animate-pulse pt-4" aria-busy="true" aria-label="Loading">
      <div className="mb-2 h-4 w-32 rounded-control bg-paper-deep" />
      <div className="mb-6 h-9 w-56 rounded-control bg-paper-deep" />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="h-40 rounded-card bg-paper-deep sm:col-span-2" />
        <div className="h-56 rounded-card bg-paper-deep" />
        <div className="h-56 rounded-card bg-paper-deep" />
      </div>
    </div>
  );
}
