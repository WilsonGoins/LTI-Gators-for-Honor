"use client";

export function DashboardSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      {/* Toolbar skeleton: search, filter, sort */}
      <div className="mx-auto max-w-7xl px-6 pt-6 pb-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-56 rounded-lg shimmer" />
          <div className="h-10 w-24 rounded-lg shimmer" />
        </div>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded shimmer" />
          <div className="h-9 w-24 rounded-full shimmer" />
          <div className="h-9 w-20 rounded-full shimmer" />
          <div className="h-9 w-28 rounded-full shimmer" />
        </div>
      </div>

      {/* Quiz cards skeleton */}
      <main className="mx-auto max-w-7xl px-6 pb-8 space-y-3">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="rounded-lg border bg-card overflow-hidden flex"
          >
            {/* Left accent bar */}
            <div className="w-1 shimmer" />

            <div className="flex-1 p-5 space-y-4">
              {/* Top row: title + badges */}
              <div className="flex items-start justify-between">
                <div className="space-y-2">
                  <div className="h-5 w-64 rounded shimmer" />
                  <div className="flex items-center gap-4">
                    <div className="h-3.5 w-40 rounded shimmer" />
                    <div className="h-3.5 w-16 rounded shimmer" />
                    <div className="h-3.5 w-24 rounded shimmer" />
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <div className="h-7 w-24 rounded-full shimmer" />
                  <div className="h-7 w-28 rounded-full shimmer" />
                </div>
              </div>

              {/* Bottom row: configured info + settings */}
              <div className="flex items-center justify-between border-t pt-3">
                <div className="h-3.5 w-52 rounded shimmer" />
                <div className="h-3.5 w-20 rounded shimmer" />
              </div>
            </div>
          </div>
        ))}
      </main>
    </div>
  );
}