// This file contains functions to interact with the backend API, such as fetching quizzes and LTI context

import { CanvasClassicQuiz, CanvasNewQuiz, Quiz, LTIContext } from "@/lib/types";
import { normalizeClassicQuiz, normalizeNewQuiz } from "@/lib/normalizers";

export const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";


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


// fetch both types of quizzes and then normalize them
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