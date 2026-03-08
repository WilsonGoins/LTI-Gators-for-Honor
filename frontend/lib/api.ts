// This file contains functions to interact with the backend API

import { CanvasClassicQuiz, CanvasNewQuiz, Quiz, LTIContext, SEBSettings } from "@/lib/types";
import { normalizeClassicQuiz, normalizeNewQuiz } from "@/lib/normalizers";

export const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";

interface SEBStatusEntry {
  configured: boolean;
  configuredDate: string | null;
  hasAccessCode: boolean;
  settings: SEBSettings | null;
}

interface QuizzesResponse {
  classic: CanvasClassicQuiz[];
  new: CanvasNewQuiz[];
  sebStatus: Record<string, SEBStatusEntry>;
}


// gets lti context from backend
export async function fetchLTIContext(token: string): Promise<LTIContext> {
  const res = await fetch(`${BACKEND_URL}/api/context`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Failed to fetch context (${res.status})`);
  return res.json();
}


// fetch quizzes, sync, and merge full SEB settings from DB
export async function fetchQuizzes(
  courseId: string,
  token: string
): Promise<Quiz[]> {
  const res = await fetch(`${BACKEND_URL}/api/courses/${courseId}/quizzes`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Failed to fetch quizzes (${res.status})`);

  const data: QuizzesResponse = await res.json();

  const classicQuizzes = (data.classic ?? []).map((q) => normalizeClassicQuiz(q, courseId));
  const newQuizzes = (data.new ?? []).map((q) => normalizeNewQuiz(q, courseId));
  const allQuizzes = [...classicQuizzes, ...newQuizzes];

  // merge SEB status + full settings from the DB into each quiz
  const sebStatus = data.sebStatus ?? {};
  for (const quiz of allQuizzes) {
    const status = sebStatus[quiz.id];
    if (status) {
      quiz.sebConfigured = status.configured;
      quiz.sebConfiguredDate = status.configuredDate;
      quiz.sebSettings = status.settings ?? null;
      // DB is source of truth for access code we set (Canvas may also report one)
      if (status.hasAccessCode) {
        quiz.hasAccessCode = true;
      }
    }
  }

  return allQuizzes;
}


// sets a randomized access code on a Canvas quiz
export async function setAccessCode(
  courseId: string,
  quizId: string,
  quizType: "classic" | "new",
  token: string
): Promise<{ accessCode: string }> {
  const res = await fetch(`${BACKEND_URL}/seb/access-code`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ courseId, quizId, quizType }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(err.detail || err.error || `Failed to set access code (${res.status})`);
  }
  return res.json();
}


// removes access code from Canvas and DB
export async function removeAccessCode(
  courseId: string,
  quizId: string,
  quizType: "classic" | "new",
  token: string
): Promise<void> {
  const res = await fetch(`${BACKEND_URL}/seb/access-code`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ courseId, quizId, quizType }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(err.detail || err.error || `Failed to remove access code (${res.status})`);
  }
}