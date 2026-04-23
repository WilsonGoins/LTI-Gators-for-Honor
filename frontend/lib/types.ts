// LTI context returned from the backend
export interface LTIContext {
  courseId: string;
  courseTitle: string;
  userName: string;
  userEmail: string;
  roles: string[];
  avatarUrl: string | null;
  canvasUrl: string;
}

// sort keys used on the dashboard quiz list
//
// Note: "unlockAt" replaces the previous "dueAt" key. Instructors care about
// when students can START the exam, not when it's due — and the unlock date
// doubles as the access-control mechanism for SEB-protected exams.
export type SortKey = "title" | "unlockAt" | "sebConfigured";

// to store both types of quizzes
export interface Quiz {
  // composite primary key (quiz_id + course_id)
  id: string;
  courseId: string;

  // core display fields
  title: string;
  description: string | null;
  // dueAt is intentionally removed — see SortKey note above. The dashboard
  // now surfaces unlockAt (Canvas "Available from") as the primary date.
  lockAt: string | null;
  unlockAt: string | null;
  published: boolean;
  pointsPossible: number | null;
  questionCount: number;
  timeLimitSeconds: number | null;

  // security / access settings
  hasAccessCode: boolean;
  accessCode?: string | null;  // only populated if SEB settings are configured or quiz on canvas has an access code
  allowedAttempts: number;       // -1 = unlimited
  shuffleQuestions: boolean;
  shuffleAnswers: boolean;
  oneAtATime: boolean;
  allowBacktracking: boolean;

  // metadata
  quizType: "classic" | "new";
  assignmentGroupId: string | null;

  // SEB status (will get from db)
  sebConfigured: boolean;
  sebConfiguredDate: string | null;
  sebSettings?: SEBSettings | null;
}

// Canvas Classic Quiz data structure (from Canvas API)
export interface CanvasClassicQuiz {
  id: number;
  title: string;
  description: string | null;
  due_at: string | null;
  lock_at: string | null;
  unlock_at: string | null;
  published: boolean;
  points_possible: number | null;
  question_count: number;
  time_limit: number | null;      // minutes
  allowed_attempts: number;
  shuffle_questions: boolean;
  shuffle_answers: boolean;
  one_question_at_a_time: boolean;
  cant_go_back: boolean;
  access_code: string | null;    //  non-null & non-empty = has access code
  assignment_group_id: number | null;
}

// Canvas New Quiz data structure (from Canvas API)
export interface CanvasNewQuiz {
  id: string;
  title: string;
  instructions: string | null;
  due_at: string | null;
  lock_at: string | null;
  unlock_at: string | null;
  published: boolean;
  points_possible: number | null;
  assignment_group_id: string | null;
  quiz_settings?: {
    question_count?: number;
    student_access_code?: string | null;
    has_time_limit?: boolean;
    session_time_limit_in_seconds?: number | null;
    allowed_attempts?: number;
    shuffle_questions?: boolean;
    shuffle_answers?: boolean;
    one_at_a_time_type?: "none" | "question";
    allow_backtracking?: boolean;
    require_student_access_code?: boolean;
  };
}

// SEB configuration settings
export interface SEBSettings {
  securityLevel: "standard" | "high" | "openBook" | "testingCenter";
  allowScreenSharing: boolean;
  allowVirtualMachine: boolean;
  allowSpellCheck: boolean;
  browserViewMode: number;
  urlFilterEnabled: boolean;
  allowedDomains: string[];
  accessCode?: string;
  configuredAt: string;
}