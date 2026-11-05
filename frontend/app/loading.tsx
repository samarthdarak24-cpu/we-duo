export default function Loading() {
  return (
    <div className="min-h-screen bg-bg p-6">
      <div className="mx-auto max-w-6xl space-y-5">
        <div className="flex items-center gap-3">
          <div className="skeleton h-11 w-11 rounded-full" />
          <div className="space-y-2">
            <div className="skeleton h-4 w-48 rounded-pill" />
            <div className="skeleton h-3 w-32 rounded-pill" />
          </div>
          <div className="skeleton ml-auto h-9 w-28 rounded-pill" />
        </div>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="card space-y-3 p-5">
              <div className="skeleton h-8 w-8 rounded-full" />
              <div className="skeleton h-6 w-20 rounded-pill" />
              <div className="skeleton h-3 w-28 rounded-pill" />
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.6fr_1fr]">
          <div className="card space-y-3 p-5">
            <div className="skeleton h-5 w-40 rounded-pill" />
            <div className="skeleton h-48 w-full rounded-card" />
            <div className="skeleton h-3 w-full rounded-pill" />
            <div className="skeleton h-3 w-4/5 rounded-pill" />
          </div>
          <div className="space-y-4">
            <div className="card space-y-3 p-5">
              <div className="skeleton h-16 w-16 rounded-full" />
              <div className="skeleton h-4 w-32 rounded-pill" />
              <div className="skeleton h-3 w-full rounded-pill" />
            </div>
            <div className="card space-y-3 p-5">
              <div className="skeleton h-4 w-28 rounded-pill" />
              <div className="skeleton h-24 w-full rounded-card" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
