// LTI context returned from the backend
export interface LTIContext {
  courseId: string;
  courseTitle: string;
  userName: string;
  userEmail: string;
  roles: string[];
  canvasUrl: string;
}

// Quiz data (dummy for now, eventually from Canvas API + DB)
export interface Quiz {
  id: string;
  title: string;
  dueAt: string | null;
  pointsPossible: number;
  questionCount: number;
  published: boolean;
  sebConfigured: boolean;
  sebSettings?: SEBSettings;
}

// SEB configuration settings
export interface SEBSettings {
  securityLevel: "standard" | "high" | "open_book" | "testing_center";
  allowQuit: boolean;
  allowScreenSharing: boolean;
  allowVirtualMachine: boolean;
  allowSpellCheck: boolean;
  browserViewMode: number;
  urlFilterEnabled: boolean;
  allowedDomains: string[];
  accessCode?: string;
  configuredAt: string;
}
