"use client";

import { Shield, User } from "lucide-react";
import { LTIContext } from "@/lib/types";

interface DashboardHeaderProps {
  context: LTIContext | null;
}

export function DashboardHeader({ context }: DashboardHeaderProps) {
  const courseTitle = context?.courseTitle || "Loading…";

  return (
    <header className="border-b bg-card">
      <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between">
        {/* Left — branding + course */}
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary text-primary-foreground">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-foreground">
              SEB Exam Creator
            </h1>
            <p className="text-sm text-muted-foreground leading-none mt-0.5">
              {courseTitle}
            </p>
          </div>
        </div>

        {/* Right — user name + avatar */}
        {context && (
          <div className="flex items-center gap-3">
            <p className="text-sm font-medium text-foreground hidden sm:block">
              {context.userName}
            </p>
            {context.avatarUrl ? (
              <img
                src={context.avatarUrl}
                alt={context.userName}
                className="w-8 h-8 rounded-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-secondary text-secondary-foreground">
                <User className="w-4 h-4" />
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}