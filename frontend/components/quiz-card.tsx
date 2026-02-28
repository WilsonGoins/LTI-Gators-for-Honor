"use client";

import {
  Calendar,
  FileQuestion,
  Award,
  ShieldCheck,
  ShieldAlert,
  Settings,
  ChevronRight,
  Eye,
  EyeOff,
} from "lucide-react";
import { Quiz } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface QuizCardProps {
  quiz: Quiz;
  onConfigure: (quiz: Quiz) => void;
  onViewSettings: (quiz: Quiz) => void;
}

function formatDate(iso: string | null): string {
  if (!iso) return "No due date";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getDueStatus(iso: string | null): "overdue" | "soon" | "upcoming" | "none" {
  if (!iso) return "none";
  const now = new Date();
  const due = new Date(iso);
  const diff = due.getTime() - now.getTime();
  const days = diff / (1000 * 60 * 60 * 24);
  if (diff < 0) return "overdue";
  if (days <= 3) return "soon";
  return "upcoming";
}

export function QuizCard({ quiz, onConfigure, onViewSettings }: QuizCardProps) {
  const dueStatus = getDueStatus(quiz.dueAt);

  return (
    <div
      className={cn(
        "group relative rounded-lg border bg-card p-5 transition-all duration-200",
        "hover:shadow-md hover:border-primary/20",
        !quiz.published && "opacity-75"
      )}
    >
      {/* SEB status indicator — subtle left border accent */}
      <div
        className={cn(
          "absolute left-0 top-3 bottom-3 w-[3px] rounded-full transition-colors",
          quiz.sebConfigured ? "bg-emerald-500" : "bg-border"
        )}
      />

      {/* Top row: title + badges */}
      <div className="flex items-start justify-between gap-3 pl-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-foreground truncate text-[15px] leading-snug">
            {quiz.title}
          </h3>

          {/* Meta row */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" />
              <span
                className={cn(
                  dueStatus === "overdue" && "text-destructive font-medium",
                  dueStatus === "soon" && "text-amber-600 font-medium"
                )}
              >
                {formatDate(quiz.dueAt)}
              </span>
            </span>

            <span className="inline-flex items-center gap-1.5">
              <Award className="w-3.5 h-3.5" />
              {quiz.pointsPossible} pts
            </span>

            <span className="inline-flex items-center gap-1.5">
              <FileQuestion className="w-3.5 h-3.5" />
              {quiz.questionCount} questions
            </span>
          </div>
        </div>

        {/* Status badges */}
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          {quiz.published ? (
            <Badge variant="success" className="gap-1">
              <Eye className="w-3 h-3" />
              Published
            </Badge>
          ) : (
            <Badge variant="secondary" className="gap-1">
              <EyeOff className="w-3 h-3" />
              Draft
            </Badge>
          )}

          {quiz.sebConfigured ? (
            <Badge variant="success" className="gap-1">
              <ShieldCheck className="w-3 h-3" />
              SEB Active
            </Badge>
          ) : (
            <Badge variant="destructive" className="gap-1">
              <ShieldAlert className="w-3 h-3" />
              No SEB
            </Badge>
          )}
        </div>
      </div>

      {/* Divider */}
      <div className="h-px bg-border mt-4 mb-3 ml-3" />

      {/* Action row */}
      <div className="flex items-center justify-between pl-3">
        {quiz.sebConfigured && quiz.sebSettings ? (
          <p className="text-xs text-muted-foreground">
            Configured{" "}
            {new Date(quiz.sebSettings.configuredAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })}{" "}
            · {quiz.sebSettings.securityLevel.replace("_", " ")} security
            {quiz.sebSettings.accessCode && (
              <>
                {" "}
                · Code: <code className="font-mono text-foreground">{quiz.sebSettings.accessCode}</code>
              </>
            )}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            SEB lockdown browser not configured for this quiz.
          </p>
        )}

        {quiz.sebConfigured ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onViewSettings(quiz)}
            className="gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <Settings className="w-3.5 h-3.5" />
            Settings
          </Button>
        ) : (
          <Button
            variant="default"
            size="sm"
            onClick={() => onConfigure(quiz)}
            className="gap-1.5"
          >
            Configure SEB
            <ChevronRight className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}