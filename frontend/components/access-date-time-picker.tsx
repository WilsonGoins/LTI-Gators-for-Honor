"use client";

import { useMemo } from "react";
import { Calendar, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface AccessDateTimePickerProps {
    /** ISO-8601 UTC string (e.g. "2026-04-22T19:00:00Z") or null when unset */
    value: string | null;
    /** Called with a new ISO-8601 UTC string, or null when cleared */
    onChange: (value: string | null) => void;
    error?: boolean;
    disabled?: boolean;
}

// Build the half-hour time options once. Format: { value: "13:30", label: "1:30 PM" }
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

// Split an ISO-8601 UTC string into local-date and local-time pieces suitable
// for the two <input> fields. Returns { date: "YYYY-MM-DD", time: "HH:MM" }
// in the user's local timezone, or empty strings if value is null/invalid.
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

// Combine a local date string + local time string into an ISO-8601 UTC string.
// Returns null if either piece is missing or the combination is invalid.
function combineLocalToISO(date: string, time: string): string | null {
    if (!date || !time) return null;
    const local = new Date(`${date}T${time}`);
    if (isNaN(local.getTime())) return null;
    return local.toISOString();
}

// Today as a "YYYY-MM-DD" string in the user's local timezone — used as the
// `min` attribute on the date input so the browser blocks past dates.
function todayLocalISO(): string {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
}

// Whether a "YYYY-MM-DD" string represents today in the user's local timezone.
function isToday(date: string): boolean {
    return date === todayLocalISO();
}

export function AccessDateTimePicker({
    value,
    onChange,
    error,
    disabled,
}: AccessDateTimePickerProps) {
    const { date, time } = useMemo(() => splitISOToLocal(value), [value]);

    // When the picked date is today, filter the dropdown to only show times
    // in the future. We compare in minutes-since-midnight to avoid timezone
    // weirdness with full Date objects.
    const availableTimes = useMemo(() => {
        if (!date || !isToday(date)) return TIME_OPTIONS;

        const now = new Date();
        const minMinutes = now.getHours() * 60 + now.getMinutes();
        return TIME_OPTIONS.filter((opt) => {
            const [h, m] = opt.value.split(":").map(Number);
            return h * 60 + m > minMinutes;
        });
    }, [date]);

    const handleDateChange = (newDate: string) => {
        // If user clears the date, clear the whole value.
        if (!newDate) {
            onChange(null);
            return;
        }

        // If the existing time would now be in the past for the newly-picked
        // date (i.e., user picked today and the previously-selected time is
        // before now), bump to the first available future slot. If none are
        // available today, clear the value so the user picks a later date.
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

    const handleTimeChange = (newTime: string) => {
        // Time alone with no date is meaningless — only emit when both are set.
        if (!date) return;
        onChange(combineLocalToISO(date, newTime));
    };

    return (
        <div className="flex gap-2">
            {/* Date input */}
            <div className="relative flex-1">
                <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                <input
                    type="date"
                    value={date}
                    min={todayLocalISO()}
                    onChange={(e) => handleDateChange(e.target.value)}
                    disabled={disabled}
                    className={cn(
                        "w-full h-9 pl-8 pr-2 rounded-md border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-shadow",
                        error && "border-destructive focus:ring-destructive/30",
                        disabled && "opacity-50 cursor-not-allowed"
                    )}
                />
            </div>

            {/* Time dropdown */}
            <div className="relative w-32">
                <Clock className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                <select
                    value={time}
                    onChange={(e) => handleTimeChange(e.target.value)}
                    disabled={disabled || !date}
                    className={cn(
                        "w-full h-9 pl-8 pr-2 rounded-md border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-shadow appearance-none",
                        error && "border-destructive focus:ring-destructive/30",
                        (disabled || !date) && "opacity-50 cursor-not-allowed"
                    )}
                >
                    {!time && <option value="">--:--</option>}
                    {availableTimes.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                            {opt.label}
                        </option>
                    ))}
                </select>
            </div>
        </div>
    );
}