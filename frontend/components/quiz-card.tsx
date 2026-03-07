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
  Lock,
  LockOpen,
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

  // Fully secured = SEB config generated AND access code set on Canvas
  const fullSecured = quiz.sebConfigured && quiz.hasAccessCode;

  return (
      <div
          className={cn(
              "group relative rounded-lg border bg-card p-5 transition-all duration-200",
              "hover:shadow-md hover:border-primary/20",
              !quiz.published && "opacity-75"
          )}
      >
        {/* Left border accent: green = fully secured, amber = partial, gray = nothing */}
        <div
            className={cn(
                "absolute left-0 top-3 bottom-3 w-[3px] rounded-full transition-colors",
                fullSecured
                    ? "bg-emerald-500"
                    : quiz.sebConfigured || quiz.hasAccessCode
                        ? "bg-amber-400"
                        : "bg-border"
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

            {/* Security status pills — only visible when something is configured */}
            {(quiz.sebConfigured || quiz.hasAccessCode) && (
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  {quiz.hasAccessCode ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium">
                  <Lock className="w-3 h-3" />
                  Access Code
                </span>
                  ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 text-xs font-medium">
                  <LockOpen className="w-3 h-3" />
                  No Access Code
                </span>
                  )}
                  {quiz.sebConfigured && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs font-medium">
                  <ShieldCheck className="w-3 h-3" />
                  SEB Config
                </span>
                  )}
                </div>
            )}
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

            {fullSecured ? (
                <Badge variant="success" className="gap-1">
                  <ShieldCheck className="w-3 h-3" />
                  Secured
                </Badge>
            ) : quiz.sebConfigured || quiz.hasAccessCode ? (
                <Badge variant="secondary" className="gap-1 border-amber-300 bg-amber-50 text-amber-700">
                  <ShieldAlert className="w-3 h-3" />
                  Partial
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
                · {quiz.sebSettings.securityLevel.replace(/([A-Z])/g, ' $1').toLowerCase()} security
                {!quiz.hasAccessCode && (
                    <span className="text-amber-600 ml-1">
                · No access code
              </span>
                )}
              </p>
          ) : (
              <p className="text-xs text-muted-foreground">
                {quiz.hasAccessCode
                    ? "Access code set, but no SEB config generated yet."
                    : "SEB lockdown browser not configured for this quiz."}
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