"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Search, ArrowUpDown } from "lucide-react";
import { LTIContext, CanvasClassicQuiz, CanvasNewQuiz, Quiz } from "@/lib/types";
import { DUMMY_QUIZZES } from "@/lib/dummy-data";
import { QuizCard } from "@/components/quiz-card";
import { SEBSettingsDialog } from "@/components/seb-settings-dialog";
import { EmptyState } from "@/components/empty-state";
import { DashboardSkeleton } from "@/components/dashboard-skeleton";
import {
  FilterDropdown,
  DEFAULT_FILTERS,
  getActiveFilterCount,
  type FilterState,
} from "@/components/filter-dropdown";
import { cn } from "@/lib/utils";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";

type SortKey = "title" | "dueAt" | "sebConfigured";


// this is a normalizer function that converts a Classic Quiz from Canvas API to our internal quiz structure
function normalizeClassicQuiz(raw: CanvasClassicQuiz, courseId: string): Quiz {
  return {
    // primary keys for db
    id: String(raw.id),     // your existing Quiz.id
    courseId,      // needed for composite key in db

    // other fields
    title: raw.title,
    description: raw.description ?? null,
    dueAt: raw.due_at ?? null,
    lockAt: raw.lock_at ?? null,
    unlockAt: raw.unlock_at ?? null,
    published: raw.published ?? false,
    pointsPossible: raw.points_possible ?? null,
    questionCount: raw.question_count ?? 0,
    timeLimitSeconds: raw.time_limit != null ? raw.time_limit * 60 : null,  // canvas gives minutes, we store seconds

    // settings for security page (might not use all of these)
    hasAccessCode: Boolean(raw.access_code),      // truthy means that the code was configured
    allowedAttempts: raw.allowed_attempts ?? 1,
    shuffleQuestions: raw.shuffle_questions ?? false,
    shuffleAnswers: raw.shuffle_answers ?? false,
    oneAtATime: raw.one_question_at_a_time ?? false,
    allowBacktracking: !(raw.cant_go_back ?? false),

    // metadata 
    quizType: "classic" as const,
    assignmentGroupId: raw.assignment_group_id
      ? String(raw.assignment_group_id)
      : null,

    // default to false for now #TODO
    sebConfigured: false,
    sebConfiguredDate: "Feb 31",
  };
}

// this is a normalizer function that converts a New Quiz from Canvas API to our internal quiz structure
function normalizeNewQuiz(raw: CanvasNewQuiz, courseId: string): Quiz {
  const s = raw.quiz_settings ?? {};
  return {
    // primary keys for db
    id: String(raw.id),
    courseId,

    // other fields
    title: raw.title,
    description: raw.instructions ?? null,           
    dueAt: raw.due_at ?? null,
    lockAt: raw.lock_at ?? null,
    unlockAt: raw.unlock_at ?? null,
    published: raw.published ?? false,
    pointsPossible: raw.points_possible ?? null,
    questionCount: s.question_count ?? 0,            
    timeLimitSeconds: s.has_time_limit               // already in seconds 
      ? (s.session_time_limit_in_seconds ?? null)
      : null,

    // settings for security page (might not use all of these)
    hasAccessCode: Boolean(s.student_access_code),   
    allowedAttempts: s.allowed_attempts ?? 1,
    shuffleQuestions: s.shuffle_questions ?? false,
    shuffleAnswers: s.shuffle_answers ?? false,
    oneAtATime: s.one_at_a_time_type === "question",     // string enum instead of boolean
    allowBacktracking: s.allow_backtracking ?? true,  

    // metadata
    quizType: "new" as const,
    assignmentGroupId: raw.assignment_group_id
      ? String(raw.assignment_group_id)
      : null,

    // dummy values until we fetch from db #TODO
    sebConfigured: false,
    sebConfiguredDate: "Feb 31",
  };
}

// Fetch quizzes from Canvas via our backend, normalize them, and return as Quiz[]
async function fetchQuizzesFromCanvas(
  courseId: string,
  token: string
): Promise<Quiz[]> {
  const res = await fetch(`${BACKEND_URL}/api/courses/${courseId}/quizzes`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch quizzes (${res.status})`);
  }

  // The backend returns both quiz types separately so we can normalize here.
  const data: { classic: CanvasClassicQuiz[]; new: CanvasNewQuiz[] } =
    await res.json();

  const classicQuizzes = (data.classic ?? []).map((q) =>
    normalizeClassicQuiz(q, courseId)
  );
  const newQuizzes = (data.new ?? []).map((q) =>
    normalizeNewQuiz(q, courseId)
  );

  return [...classicQuizzes, ...newQuizzes];
}


export default function DashboardPage() {
  // ── State ──────────────────────────────────────────────────────────────
  const [context, setContext] = useState<LTIContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [devMode, setDevMode] = useState(false);

  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [quizzesLoading, setQuizzesLoading] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [sortKey, setSortKey] = useState<SortKey>("dueAt");
  const [sortAsc, setSortAsc] = useState(true);

  const [settingsQuiz, setSettingsQuiz] = useState<Quiz | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // ── Fetch LTI context on mount ────────────────────────────────────────
  useEffect(() => {
    async function init() {
      const params = new URLSearchParams(window.location.search);
      const token = params.get("token");

      if (!token) {
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
        setQuizzes(DUMMY_QUIZZES);
        setLoading(false);
        window.history.replaceState({}, "", window.location.pathname);
        return;
      }

      try {
        sessionStorage.setItem("seb_token", token);

        const res = await fetch(`${BACKEND_URL}/api/context`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) {
          throw new Error(`Failed to fetch context (${res.status})`);
        }

        const data: LTIContext = await res.json();
        setContext(data);
        window.history.replaceState({}, "", window.location.pathname);

        setQuizzesLoading(true);
        try {
          const canvasQuizzes = await fetchQuizzesFromCanvas(
            data.courseId,
            token
          );
          setQuizzes(canvasQuizzes);
        } catch (quizErr) {
          console.error("Quiz fetch error:", quizErr);
          setError(
            quizErr instanceof Error
              ? quizErr.message
              : "Failed to load quizzes from Canvas"
          );
        } finally {
          setQuizzesLoading(false);
        }
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

    // SEB status filters (if neither is checked, show all)
    const hasSebFilter = filters.sebActive || filters.sebNone;
    if (hasSebFilter) {
      result = result.filter((quiz) => {
        if (filters.sebActive && quiz.sebConfigured) return true;
        if (filters.sebNone && !quiz.sebConfigured) return true;
        return false;
      });
    }

    // Publish status filters (if neither is checked, show all)
    const hasPubFilter = filters.published || filters.draft;
    if (hasPubFilter) {
      result = result.filter((quiz) => {
        if (filters.published && quiz.published) return true;
        if (filters.draft && !quiz.published) return true;
        return false;
      });
    }

    // Sort
    result.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "title":
          cmp = a.title.localeCompare(b.title);
          break;
        case "dueAt":
          if (!a.dueAt && !b.dueAt) cmp = 0;
          else if (!a.dueAt) cmp = 1;
          else if (!b.dueAt) cmp = -1;
          else cmp = new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
          break;
        case "sebConfigured":
          cmp =
            (a.sebConfigured ? 1 : 0) - (b.sebConfigured ? 1 : 0);
          break;
      }
      return sortAsc ? cmp : -cmp;
    });

    return result;
  }, [quizzes, searchQuery, filters, sortKey, sortAsc]);

  // ── Handlers ──────────────────────────────────────────────────────────
  const handleConfigure = useCallback((quiz: Quiz) => {
    console.log("Configure SEB for:", quiz.title);
    alert(`Navigate to SEB configuration wizard for "${quiz.title}"\n\n(This will be implemented as a separate page)`);
  }, []);

  const handleViewSettings = useCallback((quiz: Quiz) => {
    setSettingsQuiz(quiz);
    setSettingsOpen(true);
  }, []);

  const handleEditSettings = useCallback((quiz: Quiz) => {
    setSettingsOpen(false);
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

  const hasActiveFilters = getActiveFilterCount(filters) > 0;

  // ── Render ────────────────────────────────────────────────────────────
  if (loading || quizzesLoading) return <DashboardSkeleton />;

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

        {/* Toolbar: search + filter dropdown + sort */}
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