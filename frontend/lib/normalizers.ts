// This file contains functions to convert raw quiz data from the Canvas API

import { CanvasClassicQuiz, CanvasNewQuiz, Quiz } from "@/lib/types";


// convert a Classic Quiz from the Canvas API into our internal Quiz structure
export function normalizeClassicQuiz(
    raw: CanvasClassicQuiz,
    courseId: string
): Quiz {
  return {
    // primary keys
    id: String(raw.id),
    courseId,

    // core fields
    title: raw.title,
    description: raw.description ?? null,
    dueAt: raw.due_at ?? null,  // we keep this for SEB settings dialog, which shows both unlock and due dates
    lockAt: raw.lock_at ?? null,
    unlockAt: raw.unlock_at ?? null,
    published: raw.published ?? false,
    pointsPossible: raw.points_possible ?? null,
    questionCount: raw.question_count ?? 0,
    timeLimitSeconds:
        raw.time_limit != null ? raw.time_limit * 60 : null, // Canvas gives minutes

    // security-related settings
    hasAccessCode: Boolean(raw.access_code),
    accessCode: raw.access_code || null,
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

    // SEB status — defaults until we fetch from DB
    sebConfigured: false,
    sebConfiguredDate: null,
    sebSettings: null,
  };
}


// convert a New Quiz from the Canvas API into our internal Quiz structure
export function normalizeNewQuiz(
    raw: CanvasNewQuiz,
    courseId: string
): Quiz {
  const s = raw.quiz_settings ?? {};

  return {
    // primary keys
    id: String(raw.id),
    courseId,

    // core fields
    title: raw.title,
    description: raw.instructions ?? null,
    lockAt: raw.lock_at ?? null,
    unlockAt: raw.unlock_at ?? null,
    dueAt: raw.due_at ?? null,
    published: raw.published ?? false,
    pointsPossible: raw.points_possible ?? null,
    questionCount: s.question_count ?? 0,
    timeLimitSeconds: s.has_time_limit
        ? (s.session_time_limit_in_seconds ?? null)
        : null,

    // security-related settings
    hasAccessCode: Boolean(s.student_access_code),
    accessCode: s.student_access_code || null,
    allowedAttempts: s.allowed_attempts ?? 1,
    shuffleQuestions: s.shuffle_questions ?? false,
    shuffleAnswers: s.shuffle_answers ?? false,
    oneAtATime: s.one_at_a_time_type === "question",
    allowBacktracking: s.allow_backtracking ?? true,

    // metadata
    quizType: "new" as const,
    assignmentGroupId: raw.assignment_group_id
        ? String(raw.assignment_group_id)
        : null,

    // SEB status — defaults until we fetch from DB
    sebConfigured: false,
    sebConfiguredDate: null,
    sebSettings: null,
  };
}