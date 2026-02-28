"use client";

import { useState, useRef, useEffect } from "react";
import {
  Filter,
  ShieldCheck,
  ShieldAlert,
  Eye,
  EyeOff,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface FilterState {
  sebActive: boolean;
  sebNone: boolean;
  published: boolean;
  draft: boolean;
}

export const DEFAULT_FILTERS: FilterState = {
  sebActive: false,
  sebNone: false,
  published: false,
  draft: false,
};

interface FilterDropdownProps {
  filters: FilterState;
  onChange: (filters: FilterState) => void;
}

export function getActiveFilterCount(filters: FilterState): number {
  return Object.values(filters).filter(Boolean).length;
}

export function FilterDropdown({ filters, onChange }: FilterDropdownProps) {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Close on escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  const toggle = (key: keyof FilterState) => {
    onChange({ ...filters, [key]: !filters[key] });
  };

  const clearAll = () => {
    onChange(DEFAULT_FILTERS);
  };

  const activeCount = getActiveFilterCount(filters);

  return (
    <div ref={dropdownRef} className="relative">
      {/* Trigger button */}
      <button
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          "inline-flex items-center gap-1.5 h-9 px-3 rounded-md border text-sm font-medium transition-colors",
          open || activeCount > 0
            ? "bg-primary text-primary-foreground border-primary"
            : "bg-background text-foreground border-input hover:bg-secondary"
        )}
      >
        <Filter className="w-3.5 h-3.5" />
        Filter
        {activeCount > 0 && (
          <span className="inline-flex items-center justify-center w-4.5 h-4.5 rounded-full bg-primary-foreground text-primary text-[10px] font-bold leading-none ml-0.5 min-w-[18px] px-1">
            {activeCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute left-0 top-full mt-1.5 w-56 rounded-lg border bg-card shadow-lg z-50 py-1 animate-fade-in"
          style={{ animationDuration: "0.12s" }}
        >
          {/* SEB Status section */}
          <div className="px-3 pt-2 pb-1">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              SEB Status
            </p>
          </div>
          <FilterOption
            icon={ShieldCheck}
            label="SEB Active"
            checked={filters.sebActive}
            onChange={() => toggle("sebActive")}
            iconColor="text-emerald-600"
          />
          <FilterOption
            icon={ShieldAlert}
            label="Needs Setup"
            checked={filters.sebNone}
            onChange={() => toggle("sebNone")}
            iconColor="text-red-500"
          />

          {/* Divider */}
          <div className="h-px bg-border mx-3 my-1" />

          {/* Publish Status section */}
          <div className="px-3 pt-2 pb-1">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              Publish Status
            </p>
          </div>
          <FilterOption
            icon={Eye}
            label="Published"
            checked={filters.published}
            onChange={() => toggle("published")}
            iconColor="text-emerald-600"
          />
          <FilterOption
            icon={EyeOff}
            label="Draft"
            checked={filters.draft}
            onChange={() => toggle("draft")}
            iconColor="text-muted-foreground"
          />

          {/* Clear all */}
          {activeCount > 0 && (
            <>
              <div className="h-px bg-border mx-3 my-1" />
              <button
                onClick={clearAll}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
              >
                <X className="w-3 h-3" />
                Clear all filters
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function FilterOption({
  icon: Icon,
  label,
  checked,
  onChange,
  iconColor,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  checked: boolean;
  onChange: () => void;
  iconColor: string;
}) {
  return (
    <button
      onClick={onChange}
      className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-secondary/50 transition-colors"
    >
      {/* Checkbox */}
      <div
        className={cn(
          "w-4 h-4 rounded border flex items-center justify-center transition-colors shrink-0",
          checked
            ? "bg-primary border-primary"
            : "border-input bg-background"
        )}
      >
        {checked && (
          <svg
            className="w-3 h-3 text-primary-foreground"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={3}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M5 13l4 4L19 7"
            />
          </svg>
        )}
      </div>
      <Icon className={cn("w-3.5 h-3.5", iconColor)} />
      <span className="text-foreground">{label}</span>
    </button>
  );
}