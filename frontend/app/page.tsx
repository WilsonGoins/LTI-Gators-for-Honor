"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Search, Filter, ArrowUpDown } from "lucide-react";
import { LTIContext, Quiz } from "@/lib/types";
import { DUMMY_QUIZZES } from "@/lib/dummy-data";
import { DashboardHeader } from "@/components/dashboard-header";
import { StatsBar } from "@/components/stats-bar";
import { QuizCard } from "@/components/quiz-card";
import { SEBSettingsDialog } from "@/components/seb-settings-dialog";
import { EmptyState } from "@/components/empty-state";
import { DashboardSkeleton } from "@/components/dashboard-skeleton";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";

type SortKey = "title" | "dueAt" | "sebConfigured";
type FilterKey = "all" | "configured" | "unconfigured";

export default function DashboardPage() {
  // ── State ──────────────────────────────────────────────────────────────
  const [context, setContext] = useState<LTIContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [devMode, setDevMode] = useState(false);

  const [quizzes] = useState<Quiz[]>(DUMMY_QUIZZES);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterKey, setFilterKey] = useState<FilterKey>("all");
  const [sortKey, setSortKey] = useState<SortKey>("dueAt");
  const [sortAsc, setSortAsc] = useState(true);

  const [settingsQuiz, setSettingsQuiz] = useState<Quiz | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // ── Fetch LTI context on mount ────────────────────────────────────────
  useEffect(() => {
    async function init() {
      // Check URL for session token
      const params = new URLSearchParams(window.location.search);
      const token = params.get("token");

      if (!token) {
        // No token → dev mode with mock context
        console.log("⚡ No LTI token found — running in dev mode");
        setDevMode(true);
        setContext({
          courseId: "dev-101",
          courseTitle: "PSY 2012 — Introduction to Psychology",
          userName: "Dr. Jane Smith",
          userEmail: "jsmith@ufl.edu",
          roles: ["Instructor"],
          avatarUrl: null,
          canvasUrl: "https://canvas.ufl.edu",
        });
        setLoading(false);

        // Clean up URL without reload
        window.history.replaceState({}, "", window.location.pathname);
        return;
      }

      try {
        // Store token for future API calls
        sessionStorage.setItem("seb_token", token);

        const res = await fetch(`${BACKEND_URL}/api/context`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) {
          throw new Error(`Failed to fetch context (${res.status})`);
        }

        const data: LTIContext = await res.json();
        setContext(data);

        // Clean token from URL
        window.history.replaceState({}, "", window.location.pathname);
      } catch (err) {
        console.error("Context fetch error:", err);
        setError(
          err instanceof Error ? err.message : "Failed to load LTI context"
        );
      } finally {
        setLoading(false);
      }
    }

    init();
  }, []);

  // ── Filtering + sorting ───────────────────────────────────────────────
  const filteredQuizzes = useMemo(() => {
    let result = [...quizzes];

    // Text search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((quiz) =>
        quiz.title.toLowerCase().includes(q)
      );
    }

    // SEB filter
    if (filterKey === "configured") {
      result = result.filter((quiz) => quiz.sebConfigured);
    } else if (filterKey === "unconfigured") {
      result = result.filter((quiz) => !quiz.sebConfigured);
    }

    // Sort
    result.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "title":
          cmp = a.title.localeCompare(b.title);
          break;
        case "dueAt":
          // Null dates go to the end
          if (!a.dueAt && !b.dueAt) cmp = 0;
          else if (!a.dueAt) cmp = 1;
          else if (!b.dueAt) cmp = -1;
          else cmp = new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
          break;
        case "sebConfigured":
          cmp = (a.sebConfigured ? 1 : 0) - (b.sebConfigured ? 1 : 0);
          break;
      }
      return sortAsc ? cmp : -cmp;
    });

    return result;
  }, [quizzes, searchQuery, filterKey, sortKey, sortAsc]);

  // ── Handlers ──────────────────────────────────────────────────────────
  const handleConfigure = useCallback((quiz: Quiz) => {
    // TODO: Navigate to configuration wizard page
    console.log("Configure SEB for:", quiz.title);
    alert(`Navigate to SEB configuration wizard for "${quiz.title}"\n\n(This will be implemented as a separate page)`);
  }, []);

  const handleViewSettings = useCallback((quiz: Quiz) => {
    setSettingsQuiz(quiz);
    setSettingsOpen(true);
  }, []);

  const handleEditSettings = useCallback((quiz: Quiz) => {
    setSettingsOpen(false);
    // TODO: Navigate to configuration wizard in edit mode
    console.log("Edit SEB settings for:", quiz.title);
    alert(`Navigate to SEB configuration wizard (edit mode) for "${quiz.title}"`);
  }, []);

  const handleSort = useCallback(
    (key: SortKey) => {
      if (sortKey === key) {
        setSortAsc((prev) => !prev);
      } else {
        setSortKey(key);
        setSortAsc(true);
      }
    },
    [sortKey]
  );

  // ── Render ────────────────────────────────────────────────────────────
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

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader context={context} />

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
                No LTI token detected. Displaying mock data — launch from Canvas
                for real context.
              </p>
            </div>
          </div>
        )}

        {/* Stats overview */}
        <StatsBar quizzes={quizzes} />

        {/* Toolbar: search + filters + sort */}
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

          {/* Filter pills */}
          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-muted-foreground mr-1" />
            {(
              [
                ["all", "All"],
                ["configured", "SEB Active"],
                ["unconfigured", "Needs Setup"],
              ] as [FilterKey, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setFilterKey(key)}
                className={cn(
                  "px-3 py-1 rounded-full text-xs font-medium transition-colors",
                  filterKey === key
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                )}
              >
                {label}
              </button>
            ))}
          </div>

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
        {searchQuery || filterKey !== "all" ? (
          <p className="text-xs text-muted-foreground mt-4 text-center">
            Showing {filteredQuizzes.length} of {quizzes.length} quizzes
          </p>
        ) : null}
      </main>

      {/* Settings dialog */}
      <SEBSettingsDialog
        quiz={settingsQuiz}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onEdit={handleEditSettings}
      />
    </div>
  );
}