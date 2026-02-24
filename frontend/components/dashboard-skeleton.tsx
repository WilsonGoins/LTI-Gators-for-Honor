"use client";

export function DashboardSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header skeleton */}
      <header className="border-b bg-card">
        <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg shimmer" />
            <div className="space-y-2">
              <div className="h-4 w-32 rounded shimmer" />
              <div className="h-3 w-48 rounded shimmer" />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="space-y-2 hidden sm:block">
              <div className="h-3 w-24 rounded shimmer ml-auto" />
              <div className="h-2.5 w-16 rounded shimmer ml-auto" />
            </div>
            <div className="w-8 h-8 rounded-full shimmer" />
          </div>
        </div>
      </header>

      {/* Content skeleton */}
      <main className="mx-auto max-w-7xl px-6 py-8">
        {/* Stats skeleton */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-[72px] rounded-lg shimmer" />
          ))}
        </div>

        {/* Quiz grid skeleton */}
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-[140px] rounded-lg shimmer" />
          ))}
        </div>
      </main>
    </div>
  );
}
