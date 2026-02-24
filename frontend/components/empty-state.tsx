"use client";

import { FileQuestion } from "lucide-react";

export function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="flex items-center justify-center w-14 h-14 rounded-full bg-muted mb-4">
        <FileQuestion className="w-7 h-7 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold text-foreground">No quizzes found</h3>
      <p className="text-sm text-muted-foreground mt-1 max-w-sm">
        This course doesn&apos;t have any quizzes yet. Create a quiz in Canvas and
        it will appear here for SEB configuration.
      </p>
    </div>
  );
}
