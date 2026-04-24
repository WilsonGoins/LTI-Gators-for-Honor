"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Calendar as CalendarIcon, Clock, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface AccessDateTimePickerProps {
    /** ISO-8601 UTC string (e.g. "2026-04-22T19:00:00Z") or null when unset */
    value: string | null;
    /** Called with a new ISO-8601 UTC string, or null when cleared */
    onChange: (value: string | null) => void;
    error?: boolean;
    disabled?: boolean;
}

// ─── Time helpers ──────────────────────────────────────────────────────────

// Build the half-hour time options for the suggestion list.
// Format: { value: "13:30", label: "1:30 PM" }
const TIME_OPTIONS: { value: string; label: string }[] = (() => {
    const opts: { value: string; label: string }[] = [];
    for (let h = 0; h < 24; h++) {
        for (const m of [0, 30]) {
            const hh = String(h).padStart(2, "0");
            const mm = String(m).padStart(2, "0");
            const value = `${hh}:${mm}`;

            const period = h < 12 ? "AM" : "PM";
            const display12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
            const label = `${display12}:${mm} ${period}`;

            opts.push({ value, label });
        }
    }
    return opts;
})();

// Convert internal "HH:MM" (24h) to display "H:MM AM/PM"
function formatTimeDisplay(hhmm: string): string {
    const [hStr, mStr] = hhmm.split(":");
    const h = Number(hStr);
    const m = Number(mStr);
    if (isNaN(h) || isNaN(m)) return "";
    const period = h < 12 ? "AM" : "PM";
    const display12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${display12}:${String(m).padStart(2, "0")} ${period}`;
}

// Parse a freely-typed time string back into "HH:MM" (24h). Lenient — accepts:
//   "6:55 PM", "6:55pm", "6:55 P", "18:55", "6:55", "6 pm", "6", "23:00"
// Returns null if parsing fails.
//
// AM/PM disambiguation: if the user supplies a period marker, it wins.
// Otherwise an hour 0-12 is interpreted as 24-hour (so bare "6" means 6 AM,
// bare "18" means 6 PM). This matches how most date inputs behave when fed
// a 24-hour string.
function parseTimeInput(input: string): string | null {
    const s = input.trim().toLowerCase();
    if (!s) return null;

    const m = s.match(/^(\d{1,2})(?::(\d{1,2}))?\s*([ap])\.?m?\.?$|^(\d{1,2})(?::(\d{1,2}))?$/);
    if (!m) return null;

    let h: number;
    let min: number;
    let period: "a" | "p" | null = null;

    if (m[1] !== undefined) {
        h = Number(m[1]);
        min = m[2] !== undefined ? Number(m[2]) : 0;
        period = (m[3] as "a" | "p") || null;
    } else {
        h = Number(m[4]);
        min = m[5] !== undefined ? Number(m[5]) : 0;
    }

    if (isNaN(h) || isNaN(min) || min < 0 || min > 59) return null;

    if (period) {
        // 12-hour with explicit period
        if (h < 1 || h > 12) return null;
        if (period === "a" && h === 12) h = 0;
        else if (period === "p" && h !== 12) h += 12;
    } else {
        // No period — interpret as 24-hour
        if (h < 0 || h > 23) return null;
    }

    return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

// ─── Date helpers ──────────────────────────────────────────────────────────

function splitISOToLocal(value: string | null): { date: string; time: string } {
    if (!value) return { date: "", time: "" };
    const d = new Date(value);
    if (isNaN(d.getTime())) return { date: "", time: "" };

    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mn = String(d.getMinutes()).padStart(2, "0");

    return { date: `${yyyy}-${mm}-${dd}`, time: `${hh}:${mn}` };
}

function combineLocalToISO(date: string, time: string): string | null {
    if (!date || !time) return null;
    const local = new Date(`${date}T${time}`);
    if (isNaN(local.getTime())) return null;
    return local.toISOString();
}

// "YYYY-MM-DD" for today in the user's local timezone.
function todayLocalISO(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function isToday(date: string): boolean {
    return date === todayLocalISO();
}

// "YYYY-MM-DD" for an arbitrary Date in local time.
function dateToISO(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Pretty header label like "April 2026"
function formatMonthYear(year: number, month: number): string {
    return new Date(year, month, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

// Pretty trigger label like "Apr 30, 2026"
function formatDateTrigger(date: string): string {
    if (!date) return "";
    // Build via local Date so "2026-04-30" stays April 30 regardless of TZ
    const [y, m, d] = date.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
    });
}

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

// ─── Calendar popover ──────────────────────────────────────────────────────

function CalendarPopover({
    selectedDate,
    onSelect,
    onClose,
}: {
    selectedDate: string;
    onSelect: (date: string) => void;
    onClose: () => void;
}) {
    const today = todayLocalISO();
    const todayParts = today.split("-").map(Number);

    // The month being viewed — defaults to the selected date's month, or today
    const initial = selectedDate || today;
    const [y, m] = initial.split("-").map(Number);
    const [viewYear, setViewYear] = useState(y);
    const [viewMonth, setViewMonth] = useState(m - 1); // 0-indexed

    const goPrev = () => {
        if (viewMonth === 0) {
            setViewYear(viewYear - 1);
            setViewMonth(11);
        } else {
            setViewMonth(viewMonth - 1);
        }
    };

    const goNext = () => {
        if (viewMonth === 11) {
            setViewYear(viewYear + 1);
            setViewMonth(0);
        } else {
            setViewMonth(viewMonth + 1);
        }
    };

    // Don't allow navigating to a month entirely in the past
    const canGoPrev = !(viewYear < todayParts[0] ||
        (viewYear === todayParts[0] && viewMonth <= todayParts[1] - 1));

    // Build the 6-week grid
    const grid = useMemo(() => {
        const firstOfMonth = new Date(viewYear, viewMonth, 1);
        const startWeekday = firstOfMonth.getDay(); // 0=Su

        // Start from the Sunday on or before the 1st of the viewed month
        const start = new Date(viewYear, viewMonth, 1 - startWeekday);

        const cells: { date: Date; iso: string; inMonth: boolean; isPast: boolean; isToday: boolean }[] = [];
        for (let i = 0; i < 42; i++) {
            const d = new Date(start);
            d.setDate(start.getDate() + i);
            const iso = dateToISO(d);
            cells.push({
                date: d,
                iso,
                inMonth: d.getMonth() === viewMonth,
                isPast: iso < today,
                isToday: iso === today,
            });
        }
        return cells;
    }, [viewYear, viewMonth, today]);

    return (
        <div
            className="absolute left-0 top-full mt-1.5 z-50 w-[280px] rounded-lg border bg-card shadow-lg p-3 animate-fade-in"
            style={{ animationDuration: "0.12s" }}
            onClick={(e) => e.stopPropagation()}
        >
            {/* Header */}
            <div className="flex items-center justify-between mb-2">
                <button
                    type="button"
                    onClick={goPrev}
                    disabled={!canGoPrev}
                    className={cn(
                        "w-7 h-7 rounded-md flex items-center justify-center transition-colors",
                        canGoPrev
                            ? "text-foreground hover:bg-secondary"
                            : "text-muted-foreground/40 cursor-not-allowed"
                    )}
                    aria-label="Previous month"
                >
                    <ChevronLeft className="w-4 h-4" />
                </button>
                <p className="text-sm font-medium text-foreground">
                    {formatMonthYear(viewYear, viewMonth)}
                </p>
                <button
                    type="button"
                    onClick={goNext}
                    className="w-7 h-7 rounded-md flex items-center justify-center text-foreground hover:bg-secondary transition-colors"
                    aria-label="Next month"
                >
                    <ChevronRight className="w-4 h-4" />
                </button>
            </div>

            {/* Weekday header */}
            <div className="grid grid-cols-7 gap-0.5 mb-1">
                {WEEKDAYS.map((w) => (
                    <div
                        key={w}
                        className="h-7 flex items-center justify-center text-[11px] font-medium text-muted-foreground"
                    >
                        {w}
                    </div>
                ))}
            </div>

            {/* Day grid */}
            <div className="grid grid-cols-7 gap-0.5">
                {grid.map((cell) => {
                    const isSelected = cell.iso === selectedDate;
                    const disabled = cell.isPast;
                    return (
                        <button
                            key={cell.iso}
                            type="button"
                            disabled={disabled}
                            onClick={() => {
                                if (disabled) return;
                                onSelect(cell.iso);
                                onClose();
                            }}
                            className={cn(
                                "h-7 rounded-md text-xs font-medium transition-colors",
                                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                isSelected
                                    ? "bg-primary text-primary-foreground"
                                    : cell.isToday
                                        ? "ring-1 ring-primary/40 text-foreground hover:bg-secondary"
                                        : cell.inMonth
                                            ? "text-foreground hover:bg-secondary"
                                            : "text-muted-foreground/60 hover:bg-secondary",
                                disabled && "opacity-40 cursor-not-allowed hover:bg-transparent"
                            )}
                        >
                            {cell.date.getDate()}
                        </button>
                    );
                })}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between mt-2 pt-2 border-t">
                <button
                    type="button"
                    onClick={() => {
                        onSelect("");
                        onClose();
                    }}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                    Clear
                </button>
                <button
                    type="button"
                    onClick={() => {
                        onSelect(today);
                        onClose();
                    }}
                    className="text-xs text-primary hover:underline"
                >
                    Today
                </button>
            </div>
        </div>
    );
}

// ─── Time popover (suggestion list) ─────────────────────────────────────────

function TimePopover({
    options,
    selectedValue,
    onSelect,
    onClose,
    beforeSelect,
}: {
    options: { value: string; label: string }[];
    selectedValue: string;
    onSelect: (time: string) => void;
    onClose: () => void;
    /** Called synchronously before onSelect, so the parent can suppress its
     *  own blur-commit logic (which would otherwise race with the click). */
    beforeSelect?: () => void;
}) {
    // Auto-scroll the selected option into view when the popover opens
    const listRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!listRef.current) return;
        const selected = listRef.current.querySelector<HTMLButtonElement>('[data-selected="true"]');
        if (selected) selected.scrollIntoView({ block: "nearest" });
    }, []);

    return (
        <div
            className="absolute left-0 top-full mt-1.5 z-50 w-full min-w-[10rem] rounded-lg border bg-card shadow-lg py-1 animate-fade-in"
            style={{ animationDuration: "0.12s" }}
            onClick={(e) => e.stopPropagation()}
        >
            <div ref={listRef} className="max-h-56 overflow-y-auto">
                {options.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-muted-foreground">
                        No times available today.
                    </p>
                ) : (
                    options.map((opt) => {
                        const isSelected = opt.value === selectedValue;
                        return (
                            <button
                                key={opt.value}
                                type="button"
                                data-selected={isSelected}
                                // Use onMouseDown instead of onClick: mousedown
                                // fires *before* the input's blur event, so we
                                // can flip the skip-blur flag before blur runs.
                                onMouseDown={(e) => {
                                    e.preventDefault(); // keep focus on input
                                    beforeSelect?.();
                                    onSelect(opt.value);
                                    onClose();
                                }}
                                className={cn(
                                    "w-full text-left px-3 py-1.5 text-sm transition-colors",
                                    isSelected
                                        ? "bg-primary/10 text-primary font-medium"
                                        : "text-foreground hover:bg-secondary/50"
                                )}
                            >
                                {opt.label}
                            </button>
                        );
                    })
                )}
            </div>
        </div>
    );
}

// ─── Main component ────────────────────────────────────────────────────────

export function AccessDateTimePicker({
    value,
    onChange,
    error,
    disabled,
}: AccessDateTimePickerProps) {
    const { date, time } = useMemo(() => splitISOToLocal(value), [value]);

    const [calendarOpen, setCalendarOpen] = useState(false);
    const [timeOpen, setTimeOpen] = useState(false);

    const dateWrapRef = useRef<HTMLDivElement>(null);
    const timeWrapRef = useRef<HTMLDivElement>(null);

    // When the user clicks a time suggestion, the input's blur fires too. The
    // deferred blur-commit would re-parse the (still stale) draft and overwrite
    // the value just set by the suggestion click. This ref lets us suppress
    // exactly one blur-commit.
    const skipNextBlurCommit = useRef(false);

    // Local draft for the time input so the user can type freely. We commit to
    // `value` only on Enter, blur, or selecting from the dropdown.
    const [timeDraft, setTimeDraft] = useState<string>(time ? formatTimeDisplay(time) : "");
    const [timeInvalid, setTimeInvalid] = useState(false);

    // Keep the draft in sync when the parent value changes from outside
    // (e.g. on dialog open, on date change that bumps the time forward)
    useEffect(() => {
        setTimeDraft(time ? formatTimeDisplay(time) : "");
        setTimeInvalid(false);
    }, [time]);

    // Outside click closes whichever popover is open
    useEffect(() => {
        if (!calendarOpen && !timeOpen) return;
        const handler = (e: MouseEvent) => {
            const t = e.target as Node;
            if (calendarOpen && dateWrapRef.current && !dateWrapRef.current.contains(t)) {
                setCalendarOpen(false);
            }
            if (timeOpen && timeWrapRef.current && !timeWrapRef.current.contains(t)) {
                setTimeOpen(false);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [calendarOpen, timeOpen]);

    // Escape closes any open popover
    useEffect(() => {
        if (!calendarOpen && !timeOpen) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                setCalendarOpen(false);
                setTimeOpen(false);
            }
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [calendarOpen, timeOpen]);

    // When the picked date is today, filter the dropdown to only show times
    // in the future.
    const availableTimes = useMemo(() => {
        if (!date || !isToday(date)) return TIME_OPTIONS;
        const now = new Date();
        const minMinutes = now.getHours() * 60 + now.getMinutes();
        return TIME_OPTIONS.filter((opt) => {
            const [h, m] = opt.value.split(":").map(Number);
            return h * 60 + m > minMinutes;
        });
    }, [date]);

    const handleDateSelect = (newDate: string) => {
        if (!newDate) {
            onChange(null);
            return;
        }
        // If existing time would now be in the past for the newly-picked date,
        // bump to the first available future slot. If none today, clear.
        let nextTime = time || "09:00";
        if (isToday(newDate)) {
            const now = new Date();
            const nowMinutes = now.getHours() * 60 + now.getMinutes();
            const [h, m] = nextTime.split(":").map(Number);
            if (h * 60 + m <= nowMinutes) {
                const firstFuture = TIME_OPTIONS.find((opt) => {
                    const [oh, om] = opt.value.split(":").map(Number);
                    return oh * 60 + om > nowMinutes;
                });
                if (!firstFuture) {
                    onChange(null);
                    return;
                }
                nextTime = firstFuture.value;
            }
        }
        onChange(combineLocalToISO(newDate, nextTime));
    };

    const handleTimeSelect = (newTime: string) => {
        if (!date) return;
        onChange(combineLocalToISO(date, newTime));
    };

    // Commit the typed draft. Called on blur and Enter.
    const commitTimeDraft = () => {
        if (!date) {
            // Can't commit a time without a date — just clear the draft if empty
            if (!timeDraft.trim()) setTimeInvalid(false);
            return;
        }
        if (!timeDraft.trim()) {
            // Empty draft on a quiz with a date set — treat as invalid
            setTimeInvalid(true);
            return;
        }
        const parsed = parseTimeInput(timeDraft);
        if (!parsed) {
            setTimeInvalid(true);
            return;
        }

        // Reject past times when the date is today
        if (isToday(date)) {
            const now = new Date();
            const nowMinutes = now.getHours() * 60 + now.getMinutes();
            const [ph, pm] = parsed.split(":").map(Number);
            if (ph * 60 + pm <= nowMinutes) {
                setTimeInvalid(true);
                return;
            }
        }

        setTimeInvalid(false);
        // Re-format to canonical "H:MM AM/PM" for visual consistency
        setTimeDraft(formatTimeDisplay(parsed));
        handleTimeSelect(parsed);
    };

    return (
        <div className="flex gap-2">
            {/* ─── Date trigger + popover ─────────────────────────────── */}
            <div ref={dateWrapRef} className="relative flex-1">
                <button
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                        setCalendarOpen((p) => !p);
                        setTimeOpen(false);
                    }}
                    className={cn(
                        "w-full h-9 pl-8 pr-2 rounded-md border bg-background text-left text-sm transition-shadow",
                        "focus:outline-none focus:ring-2 focus:ring-ring",
                        date ? "text-foreground" : "text-muted-foreground",
                        error && "border-destructive focus:ring-destructive/30",
                        disabled && "opacity-50 cursor-not-allowed"
                    )}
                >
                    {date ? formatDateTrigger(date) : "Select a date"}
                </button>
                <CalendarIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                {calendarOpen && (
                    <CalendarPopover
                        selectedDate={date}
                        onSelect={handleDateSelect}
                        onClose={() => setCalendarOpen(false)}
                    />
                )}
            </div>

            {/* ─── Time combobox + popover ─────────────────────────────── */}
            <div ref={timeWrapRef} className="relative w-32">
                <input
                    type="text"
                    value={timeDraft}
                    onChange={(e) => {
                        setTimeDraft(e.target.value);
                        if (timeInvalid) setTimeInvalid(false);
                    }}
                    onFocus={() => {
                        // Open the suggestion list on focus, but only if a date is set
                        if (date) setTimeOpen(true);
                    }}
                    onBlur={() => {
                        // Defer slightly so a click on a popover option isn't
                        // killed by the blur firing first
                        setTimeout(() => {
                            if (skipNextBlurCommit.current) {
                                skipNextBlurCommit.current = false;
                                return;
                            }
                            commitTimeDraft();
                        }, 100);
                    }}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") {
                            e.preventDefault();
                            commitTimeDraft();
                            setTimeOpen(false);
                            (e.target as HTMLInputElement).blur();
                        }
                    }}
                    placeholder="6:55 PM"
                    disabled={disabled || !date}
                    className={cn(
                        "w-full h-9 pl-8 pr-2 rounded-md border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-shadow",
                        (error || timeInvalid) && "border-destructive focus:ring-destructive/30",
                        (disabled || !date) && "opacity-50 cursor-not-allowed"
                    )}
                />
                <Clock className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                {timeOpen && date && (
                    <TimePopover
                        options={availableTimes}
                        selectedValue={time}
                        onSelect={handleTimeSelect}
                        onClose={() => setTimeOpen(false)}
                        beforeSelect={() => {
                            skipNextBlurCommit.current = true;
                        }}
                    />
                )}
            </div>
        </div>
    );
}