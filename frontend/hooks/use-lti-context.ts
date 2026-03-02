// this hook fetches the LTI context and quizzes, or gets mock data if there's no LTI token (dev mode)
// this basically handles everything that happens when the page first loads

import { useEffect, useState } from "react";
import { LTIContext, Quiz } from "@/lib/types";
import { DUMMY_QUIZZES } from "@/lib/dummy-data";
import { fetchLTIContext, fetchQuizzes } from "@/lib/api";

interface UseLTIContextReturn {
  context: LTIContext | null;
  quizzes: Quiz[];
  loading: boolean;
  error: string | null;
  devMode: boolean;
}

export function useLTIContext(): UseLTIContextReturn {
  const [context, setContext] = useState<LTIContext | null>(null);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [devMode, setDevMode] = useState(false);

  useEffect(() => {
    async function init() {
      const params = new URLSearchParams(window.location.search);
      const token = params.get("token");

      // if dev-mode 
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

      // if LTI token present, proceed with real LTI flow 
      try {
        sessionStorage.setItem("seb_token", token);
        window.history.replaceState({}, "", window.location.pathname);

        const ctx = await fetchLTIContext(token);
        setContext(ctx);

        try {
          const canvasQuizzes = await fetchQuizzes(ctx.courseId, token);
          setQuizzes(canvasQuizzes);
        } catch (quizErr) {
          console.error("Quiz fetch error:", quizErr);
          setError(
            quizErr instanceof Error
              ? quizErr.message
              : "Failed to load quizzes from Canvas"
          );
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

  return { context, quizzes, loading, error, devMode };
}