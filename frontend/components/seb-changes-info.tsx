"use client";

import { useState, useRef, useEffect } from "react";
import { HelpCircle, X, FileDown, KeyRound, BookText, Type } from "lucide-react";
import { cn } from "@/lib/utils";

interface ConfigOverrides {
    allowQuit: boolean;
    allowScreenSharing: boolean;
    allowVirtualMachine: boolean;
    allowSpellCheck: boolean;
    urlFilterEnabled: boolean;
}

interface SEBChangesInfoProps {
    quizTitle: string;
    accessCode: string;
    overrides: ConfigOverrides;
    allowedDomains: string;
    disabled?: boolean;
}

interface ChangeItem {
    icon: React.ElementType;
    label: string;
    detail: string;
}

export function SEBChangesInfo({
    quizTitle,
    accessCode,
    disabled,
}: SEBChangesInfoProps) {
    const [open, setOpen] = useState(false);
    const [showTooltip, setShowTooltip] = useState(false);
    const panelRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);

    // Close panel on outside click
    useEffect(() => {
        if (!open) return;
        function handleClick(e: MouseEvent) {
            if (
                panelRef.current &&
                !panelRef.current.contains(e.target as Node) &&
                buttonRef.current &&
                !buttonRef.current.contains(e.target as Node)
            ) {
                setOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, [open]);

    // Close on Escape
    useEffect(() => {
        if (!open) return;
        function handleKey(e: KeyboardEvent) {
            if (e.key === "Escape") setOpen(false);
        }
        document.addEventListener("keydown", handleKey);
        return () => document.removeEventListener("keydown", handleKey);
    }, [open]);

    // Build the list of changes based on current config state
    const changes: ChangeItem[] = [];

    changes.push(
        {
            icon: Type,
            label: "Quiz title updated",
            detail: `The title will have "(Requires SEB)" appended to it.`,
        },
        {
            icon: BookText,
            label: "Quiz instructions updated",
            detail: `The assignment instructions will indicate how to launch it with SEB.`,
        },
        {
            icon: KeyRound,
            label: "Access code set on Canvas",
            detail: `Code "${accessCode}" will be required to take the assessment.`,
        },
        {
            icon: FileDown,
            label: ".seb config file downloaded",
            detail: `A configuration file will be saved to your device and "Canvas Files".`,
        }
);


    return (
        <div className="relative">
            {/* Trigger button */}
            <button
                ref={buttonRef}
                type="button"
                disabled={disabled}
                onClick={() => {
                    setOpen((prev) => !prev);
                    setShowTooltip(false);
                }}
                onMouseEnter={() => {
                    if (!open) setShowTooltip(true);
                }}
                onMouseLeave={() => setShowTooltip(false)}
                className={cn(
                    "w-8 h-8 rounded-md flex items-center justify-center transition-colors",
                    "text-muted-foreground hover:text-foreground hover:bg-muted",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    disabled && "opacity-50 pointer-events-none"
                )}
                aria-label="What will this change?"
            >
                <HelpCircle className="w-4 h-4" />
            </button>

            {/* Hover tooltip */}
            {showTooltip && !open && (
                <div className="absolute bottom-full mb-2 right-0 z-50 pointer-events-none animate-in fade-in duration-150">
                    <div className="px-2.5 py-1.5 rounded-md bg-card border shadow-md text-xs text-foreground whitespace-nowrap">
                        What will this change?
                    </div>
                </div>
            )}

            {/* Info panel */}
            {open && (
                <div
                    ref={panelRef}
                    className="fixed bottom-14 left-4 right-4 z-[60] max-w-xs mx-auto animate-in fade-in slide-in-from-bottom-2 duration-200"
                >
                    <div className="rounded-xl border bg-card shadow-xl overflow-hidden">
                        {/* Panel header */}
                        <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
                            <p className="text-sm font-semibold text-foreground">
                                What happens when you save
                            </p>
                            <button
                                onClick={() => setOpen(false)}
                                className="w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        </div>

                        {/* Changes list */}
                        <div className="px-4 py-3 space-y-3 max-h-74 overflow-y-auto">
                            {changes.map((change, i) => {
                                const Icon = change.icon;
                                return (
                                    <div key={i} className="flex gap-2.5">
                                        <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                                            <Icon className="w-3.5 h-3.5 text-primary" />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-sm font-medium text-foreground leading-snug">
                                                {change.label}
                                            </p>
                                            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                                                {change.detail}
                                            </p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Footer note */}
                        <div className="px-4 py-2.5 border-t bg-muted/20">
                            <p className="text-[11px] text-muted-foreground leading-relaxed">
                                All changes can be reverted by reconfiguring the quiz in Canvas.
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}