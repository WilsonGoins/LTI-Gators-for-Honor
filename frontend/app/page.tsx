"use client";

import { useState, useCallback } from "react";
import { Search, ArrowUpDown } from "lucide-react";
import { Quiz, SortKey } from "@/lib/types";
import { QuizCard } from "@/components/quiz-card";
import { SEBSettingsDialog } from "@/components/seb-settings-dialog";
import { SEBConfigDialog } from "@/components/seb-config-dialog";
import { EmptyState } from "@/components/empty-state";
import { DashboardSkeleton } from "@/components/dashboard-skeleton";
import { FilterDropdown } from "@/components/filter-dropdown";
import { cn } from "@/lib/utils";

import { useLTIContext } from "@/hooks/use-lti-context";
import { useFilteredQuizzes } from "@/hooks/use-filtered-quizzes";

export default function DashboardPage() {
  // data & auth
  const { context, quizzes, setQuizzes, loading, error, devMode } = useLTIContext();

  // search, filter, sort
  const {
    filteredQuizzes,
    searchQuery,
    setSearchQuery,
    filters,
    setFilters,
    sortKey,
    sortAsc,
    handleSort,
    hasActiveFilters,
  } = useFilteredQuizzes(quizzes);

  // SEB settings dialog (view mode)
  const [settingsQuiz, setSettingsQuiz] = useState<Quiz | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // SEB config dialog (configure mode)
  const [configQuiz, setConfigQuiz] = useState<Quiz | null>(null);
  const [configOpen, setConfigOpen] = useState(false);

  // handlers
  const handleConfigure = useCallback((quiz: Quiz) => {
    setConfigQuiz(quiz);
    setConfigOpen(true);
  }, []);

  const handleViewSettings = useCallback((quiz: Quiz) => {
    setSettingsQuiz(quiz);
    setSettingsOpen(true);
  }, []);

  const handleEditSettings = useCallback((quiz: Quiz) => {
    setSettingsOpen(false);
    setConfigQuiz(quiz);
    setConfigOpen(true);
  }, []);

  // Called after the config dialog saves successfully
  const handleConfigSaved = useCallback((quizId: string, accessCodeSet: boolean, settings: import("@/lib/types").SEBSettings) => {
    setQuizzes((prev) =>
        prev.map((q) =>
            q.id === quizId
                ? {
                  ...q,
                  hasAccessCode: accessCodeSet ? true : q.hasAccessCode,
                  sebConfigured: true,
                  sebConfiguredDate: new Date().toISOString(),
                  sebSettings: settings,
                  title: q.title.includes('Requires SEB') ? q.title : `${q.title} (Requires SEB)`,
                }
                : q
        )
    );
  }, [setQuizzes]);

  // loading / error states
  if (loading) return <DashboardSkeleton />;

  if (error) {
    return (
        <div className="min-h-screen bg-background flex items-center justify-center p-6">
          <div className="max-w-md text-center">
            <div className="w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">✕</span>
            </div>
            <h2 className="text-lg font-semibold text-foreground">
              Unable to Load
            </h2>
            <p className="text-sm text-muted-foreground mt-2">{error}</p>
            <p className="text-xs text-muted-foreground mt-4">
              Try launching the tool again from Canvas.
            </p>
          </div>
        </div>
    );
  }

  // main render
  return (
      <div className="min-h-screen bg-background">
        <main className="mx-auto max-w-7xl px-6 py-8">
          {/* Dev mode banner */}
          {devMode && (
              <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 flex items-center gap-3">
                <span className="text-amber-600 text-lg">⚡</span>
                <div>
                  <p className="text-sm font-medium text-amber-800">
                    Development Mode
                  </p>
                  <p className="text-xs text-amber-600">
                    No LTI token detected. Displaying mock data — launch from
                    Canvas for real context.
                  </p>
                </div>
              </div>
          )}

          {/* Toolbar: search + filter + sort */}
          <div className="mt-8 mb-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
            {/* Search */}
            <div className="relative flex-1 w-full sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                  type="text"
                  placeholder="Search quizzes…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full h-9 pl-9 pr-3 rounded-md border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-shadow"
              />
            </div>

            {/* Filter dropdown */}
            <FilterDropdown filters={filters} onChange={setFilters} />

            {/* Sort */}
            <div className="flex items-center gap-1.5 sm:ml-auto">
              <ArrowUpDown className="w-3.5 h-3.5 text-muted-foreground mr-1" />
              {(
                  [
                    ["dueAt", "Due Date"],
                    ["title", "Name"],
                    ["sebConfigured", "SEB Status"],
                  ] as [SortKey, string][]
              ).map(([key, label]) => (
                  <button
                      key={key}
                      onClick={() => handleSort(key)}
                      className={cn(
                          "px-3 py-1 rounded-full text-xs font-medium transition-colors",
                          sortKey === key
                              ? "bg-primary text-primary-foreground"
                              : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                      )}
                  >
                    {label}
                    {sortKey === key && (
                        <span className="ml-1">{sortAsc ? "↑" : "↓"}</span>
                    )}
                  </button>
              ))}
            </div>
          </div>

          {/* Quiz grid */}
          {filteredQuizzes.length === 0 ? (
              <EmptyState />
          ) : (
              <div className="space-y-3 stagger-fade">
                {filteredQuizzes.map((quiz) => (
                    <QuizCard
                        key={quiz.id}
                        quiz={quiz}
                        onConfigure={handleConfigure}
                        onViewSettings={handleViewSettings}
                    />
                ))}
              </div>
          )}

          {/* Results count */}
          {(searchQuery || hasActiveFilters) && (
              <p className="text-xs text-muted-foreground mt-4 text-center">
                Showing {filteredQuizzes.length} of {quizzes.length} quizzes
              </p>
          )}
        </main>

        {/* Settings dialog (view mode) */}
        <SEBSettingsDialog
            quiz={settingsQuiz}
            open={settingsOpen}
            courseId={context?.courseId || ""}
            onClose={() => setSettingsOpen(false)}
            onEdit={handleEditSettings}
        />

        {/* Config dialog (configure mode) */}
        <SEBConfigDialog
            quiz={configQuiz}
            open={configOpen}
            courseId={context?.courseId || ""}
            canvasUrl={context?.canvasUrl || ""}
            onClose={() => setConfigOpen(false)}
            onSaved={handleConfigSaved}
        />
      </div>
  );
}