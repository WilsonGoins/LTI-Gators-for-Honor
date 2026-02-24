"use client";

import { FileQuestion, ShieldCheck, ShieldAlert, Clock } from "lucide-react";
import { Quiz } from "@/lib/types";
import { cn } from "@/lib/utils";

interface StatsBarProps {
  quizzes: Quiz[];
}

interface StatCardProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  accent?: string;
}

function StatCard({ icon: Icon, label, value, accent }: StatCardProps) {
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3">
      <div
        className={cn(
          "flex items-center justify-center w-9 h-9 rounded-lg",
          accent || "bg-secondary text-secondary-foreground"
        )}
      >
        <Icon className="w-4.5 h-4.5" />
      </div>
      <div>
        <p className="text-2xl font-semibold tracking-tight text-foreground leading-none">
          {value}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
      </div>
    </div>
  );
}

export function StatsBar({ quizzes }: StatsBarProps) {
  const total = quizzes.length;
  const sebConfigured = quizzes.filter((q) => q.sebConfigured).length;
  const unconfigured = total - sebConfigured;
  const upcoming = quizzes.filter((q) => {
    if (!q.dueAt) return false;
    const due = new Date(q.dueAt);
    const now = new Date();
    const days = (due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    return days > 0 && days <= 7;
  }).length;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <StatCard
        icon={FileQuestion}
        label="Total Quizzes"
        value={total}
        accent="bg-secondary text-secondary-foreground"
      />
      <StatCard
        icon={ShieldCheck}
        label="SEB Configured"
        value={sebConfigured}
        accent="bg-emerald-50 text-emerald-600"
      />
      <StatCard
        icon={ShieldAlert}
        label="Needs Setup"
        value={unconfigured}
        accent="bg-amber-50 text-amber-600"
      />
      <StatCard
        icon={Clock}
        label="Due This Week"
        value={upcoming}
        accent="bg-sky-50 text-sky-600"
      />
    </div>
  );
}
