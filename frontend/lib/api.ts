// This file contains functions to interact with the backend API, such as fetching quizzes and LTI context

import { CanvasClassicQuiz, CanvasNewQuiz, Quiz, LTIContext } from "@/lib/types";
import { normalizeClassicQuiz, normalizeNewQuiz } from "@/lib/normalizers";

export const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";

interface SEBStatusEntry {    // seb status returned by the backend for each quiz
  configured: boolean;
  configuredDate: string | null;
}

interface QuizzesResponse {     // response from the backend when fetching quizzes
  classic: CanvasClassicQuiz[];
  new: CanvasNewQuiz[];
  sebStatus: Record<string, SEBStatusEntry>;  // keyed by quiz_id
}


// gets lti context from backend, which in turn gets it from the LTI launch request
export async function fetchLTIContext(token: string): Promise<LTIContext> {
  const res = await fetch(`${BACKEND_URL}/api/context`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch context (${res.status})`);
  }

  return res.json();
}


// fetch both types of quizzes, upsert and join tables (in backend) and then normalize them
export async function fetchQuizzes(
    courseId: string,
    token: string
): Promise<Quiz[]> {
  const res = await fetch(`${BACKEND_URL}/api/courses/${courseId}/quizzes`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch quizzes (${res.status})`);
  }

  const data: QuizzesResponse = await res.json();

  // normalize both quiz types
  const classicQuizzes = (data.classic ?? []).map((q) =>
      normalizeClassicQuiz(q, courseId)
  );
  const newQuizzes = (data.new ?? []).map((q) =>
      normalizeNewQuiz(q, courseId)
  );

  const allQuizzes = [...classicQuizzes, ...newQuizzes];

  // merge SEB status from the DB into each quiz
  const sebStatus = data.sebStatus ?? {};
  for (const quiz of allQuizzes) {
    const status = sebStatus[quiz.id];
    if (status) {
      quiz.sebConfigured = status.configured;
      quiz.sebConfiguredDate = status.configuredDate;
    }
  }

  return allQuizzes;    // return as an array of normalized quizzes with SEB status merged in
}


// sets a randomized access code on a Canvas quiz (or replaces the existing one)
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