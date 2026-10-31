export default function Loading() {
  return (
    <div className="animate-pulse pt-4" aria-busy="true" aria-label="Loading">
      <div className="mb-2 h-4 w-32 rounded-control bg-white/70" />
      <div className="mb-6 h-9 w-56 rounded-control bg-white/70" />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="h-40 rounded-card bg-white/70 sm:col-span-2" />
        <div className="h-56 rounded-card bg-white/70" />
        <div className="h-56 rounded-card bg-white/70" />
      </div>
    </div>
  );
}
