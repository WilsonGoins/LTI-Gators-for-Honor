"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
    X,
    Shield,
    ShieldCheck,
    Monitor,
    Keyboard,
    Globe,
    Lock,
    Loader2,
    AlertTriangle,
    Pencil,
} from "lucide-react";
import { Quiz } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BACKEND_URL, setAccessCode } from "@/lib/api";

// ── Types ────────────────────────────────────────────────────────────────────

interface SEBConfigDialogProps {
    quiz: Quiz | null;
    open: boolean;
    courseId: string;
    canvasUrl: string;
    onClose: () => void;
    onSaved: (quizId: string, accessCodeSet: boolean, settings: import("@/lib/types").SEBSettings) => void;
}

interface Preset {
    id: string;
    name: string;
    description: string;
}

// Default overrides — these map to the SEB config toggles
interface ConfigOverrides {
    allowQuit: boolean;
    allowScreenSharing: boolean;
    allowVirtualMachine: boolean;
    allowSpellCheck: boolean;
    urlFilterEnabled: boolean;
}

// What each preset defaults to (so toggles reset when you switch presets)
const PRESET_DEFAULTS: Record<string, ConfigOverrides> = {
    standard: {
        allowQuit: false,
        allowScreenSharing: false,
        allowVirtualMachine: false,
        allowSpellCheck: false,
        urlFilterEnabled: true,
    },
    high: {
        allowQuit: false,
        allowScreenSharing: false,
        allowVirtualMachine: false,
        allowSpellCheck: false,
        urlFilterEnabled: true,
    },
    openBook: {
        allowQuit: false,
        allowScreenSharing: false,
        allowVirtualMachine: false,
        allowSpellCheck: true,
        urlFilterEnabled: false,
    },
    testingCenter: {
        allowQuit: false,
        allowScreenSharing: false,
        allowVirtualMachine: false,
        allowSpellCheck: false,
        urlFilterEnabled: true,
    },
};

// ── Toggle Row ───────────────────────────────────────────────────────────────

function ToggleRow({
                       icon: Icon,
                       label,
                       description,
                       checked,
                       onChange,
                       disabled,
                   }: {
    icon: React.ElementType;
    label: string;
    description: string;
    checked: boolean;
    onChange: (val: boolean) => void;
    disabled?: boolean;
}) {
    return (
        <label
            className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors cursor-pointer",
                "hover:bg-muted/50",
                disabled && "opacity-50 cursor-not-allowed"
            )}
        >
            <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{label}</p>
                <p className="text-xs text-muted-foreground">{description}</p>
            </div>
            <button
                type="button"
                role="switch"
                aria-checked={checked}
                disabled={disabled}
                onClick={() => onChange(!checked)}
                className={cn(
                    "relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors duration-200",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    checked ? "bg-primary" : "bg-input",
                    disabled && "pointer-events-none"
                )}
            >
        <span
            className={cn(
                "pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200",
                "translate-y-0.5",
                checked ? "translate-x-[18px]" : "translate-x-0.5"
            )}
        />
            </button>
        </label>
    );
}

// ── Main Dialog ──────────────────────────────────────────────────────────────

export function SEBConfigDialog({
                                    quiz,
                                    open,
                                    courseId,
                                    canvasUrl,
                                    onClose,
                                    onSaved,
                                }: SEBConfigDialogProps) {
    // Presets from backend
    const [presets, setPresets] = useState<Preset[]>([]);
    const [presetsLoaded, setPresetsLoaded] = useState(false);

    // Form state
    const [selectedPreset, setSelectedPreset] = useState("standard");
    const [overrides, setOverrides] = useState<ConfigOverrides>(
        PRESET_DEFAULTS.standard
    );
    const [allowedDomains, setAllowedDomains] = useState("");
    const [quitPassword, setQuitPassword] = useState("");
    const [accessCode, setAccessCode_] = useState("");  
    const [isEditingAccessCode, setIsEditingAccessCode] = useState(false);
    const accessCodeInputRef = useRef<HTMLInputElement>(null);

    // Status
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [toast, setToast] = useState<string | null>(null);
    const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const showToast = useCallback((message: string) => {
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        setToast(message);
        toastTimerRef.current = setTimeout(() => setToast(null), 3000);
    }, []);

    // Clean up toast timer on unmount
    useEffect(() => {
        return () => {
            if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        };
    }, []);


    // Fetch presets on first open
    useEffect(() => {
        if (!open || presetsLoaded) return;

        fetch(`${BACKEND_URL}/seb/presets`)
            .then((res) => res.json())
            .then((data) => {
                setPresets(data.presets || []);
                setPresetsLoaded(true);
            })
            .catch((err) => {
                console.error("Failed to fetch presets:", err);
                // Fall back to hardcoded names
                setPresets([
                    { id: "standard", name: "Standard", description: "Recommended for most exams" },
                    { id: "high", name: "High Security", description: "Maximum lockdown" },
                    { id: "openBook", name: "Open Book", description: "Allows reference materials" },
                    { id: "testingCenter", name: "Testing Center", description: "For proctored environments" },
                ]);
                setPresetsLoaded(true);
            });
    }, [open, presetsLoaded]);


    // Generate a random 6-character alphanumeric code
    const generateRandomCode = useCallback(() => {
        const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
        let code = "";
        for (let i = 0; i < 6; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
    }, []);


    // Reset form when a new quiz is opened
    useEffect(() => {
        if (open && quiz) {
            setSelectedPreset("standard");
            setOverrides(PRESET_DEFAULTS.standard);
            setAllowedDomains(canvasUrl ? new URL(canvasUrl).hostname : "");
            setQuitPassword("");
            setIsEditingAccessCode(false);
            setError(null);
            setToast(null);
            setSaving(false);

            // Pre-fill access code: use existing from DB/Canvas, or generate random
            const existing = quiz.sebSettings?.accessCode || quiz.accessCode;
            setAccessCode_(existing || generateRandomCode());
        }
    }, [open, quiz, canvasUrl, generateRandomCode]);

    // When preset changes, reset toggles to that preset's defaults
    const handlePresetChange = useCallback((presetId: string) => {
        setSelectedPreset(presetId);
        setOverrides(PRESET_DEFAULTS[presetId] || PRESET_DEFAULTS.standard);
    }, []);

    // Toggle handler
    const setOverride = useCallback(
        (key: keyof ConfigOverrides, value: boolean) => {
            setOverrides((prev) => ({ ...prev, [key]: value }));
        },
        []
    );

    // ── Save handler ─────────────────────────────────────────────────────────
    const handleSave = useCallback(async () => {
        if (!quiz) return;

        // Validate access code length
        if (accessCode.trim().length < 5) {
            showToast("Access code must be at least 5 characters.");
            return;
        }

        setSaving(true);
        setError(null);

        const token = sessionStorage.getItem("seb_token");
        if (!token) {
            setError("Session expired. Please relaunch from Canvas.");
            setSaving(false);
            return;
        }
        console.log("courseId:", courseId, "quizId:", quiz?.id);

        try {
            // Step 1: Set the access code on Canvas
            const result = await setAccessCode(courseId, quiz.id, quiz.quizType, token, accessCode);
            const accessCodeValue = result.accessCode;


            // Step 2: Generate the .seb config file via backend
            const startURL = `${canvasUrl}/courses/${courseId}/quizzes/${quiz.id}/take`;
            const domains = allowedDomains
                .split(/[,\n]/)
                .map((d) => d.trim())
                .filter(Boolean);

            const generateRes = await fetch(`${BACKEND_URL}/seb/generate`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    courseId,
                    quizId: quiz.id,
                    startURL,
                    preset: selectedPreset,
                    allowedDomains: domains,
                    quitPassword: quitPassword || null,
                    overrides,
                    accessCode: accessCodeValue,
                }),
            });

            if (!generateRes.ok) {
                const err = await generateRes.json().catch(() => ({}));
                throw new Error(err.error || `Generation failed (${generateRes.status})`);
            }

            // Step 3: Download the .seb file
            const blob = await generateRes.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `seb_${quiz.title.replace(/\s+/g, "_").toLowerCase()}_${Date.now()}.seb`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            // Done — build the settings object for the parent to store
            const savedSettings = {
                securityLevel: selectedPreset as "standard" | "high" | "openBook" | "testingCenter",
                allowQuit: overrides.allowQuit,
                allowScreenSharing: overrides.allowScreenSharing,
                allowVirtualMachine: overrides.allowVirtualMachine,
                allowSpellCheck: overrides.allowSpellCheck,
                browserViewMode: 1,
                urlFilterEnabled: overrides.urlFilterEnabled,
                allowedDomains: domains,
                configuredAt: new Date().toISOString(),
            };

            onSaved(quiz.id, true, savedSettings);
            onClose();
        } catch (err) {
            console.error("SEB config save error:", err);
            setError(err instanceof Error ? err.message : "Failed to save configuration");
        } finally {
            setSaving(false);
        }
    }, [quiz, courseId, canvasUrl, selectedPreset, overrides, allowedDomains, quitPassword, accessCode, onSaved, onClose]);

    // ── Render ───────────────────────────────────────────────────────────────
    if (!open || !quiz) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Toast notification */}
            {toast && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[60] animate-in slide-in-from-top-2 fade-in duration-200">
                    <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-destructive text-destructive-foreground shadow-lg text-sm font-medium">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        {toast}
                    </div>
                </div>
            )}

            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
                onClick={onClose}
            />

            {/* Dialog */}
            <div className="relative w-full max-w-lg mx-4 max-h-[85vh] flex flex-col bg-card rounded-xl border shadow-xl animate-in fade-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                            <Shield className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                            <h2 className="text-[15px] font-semibold text-foreground">
                                Configure SEB
                            </h2>
                            <p className="text-xs text-muted-foreground truncate max-w-[280px]">
                                {quiz.title}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Scrollable body */}
                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
                    {/* Error banner */}
                    {error && (
                        <div className="flex items-start gap-2 px-3 py-2.5 rounded-md bg-destructive/10 border border-destructive/20">
                            <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                            <p className="text-xs text-destructive">{error}</p>
                        </div>
                    )}

                    {/* Security Preset */}
                    <div>
                        <label className="text-sm font-medium text-foreground">
                            Security Preset
                        </label>
                        <p className="text-xs text-muted-foreground mt-0.5 mb-2">
                            Choose a baseline, then customize individual settings below.
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                            {presets.map((preset) => (
                                <button
                                    key={preset.id}
                                    onClick={() => handlePresetChange(preset.id)}
                                    className={cn(
                                        "text-left px-3 py-2.5 rounded-lg border transition-all duration-150",
                                        selectedPreset === preset.id
                                            ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                                            : "border-border hover:border-primary/30 hover:bg-muted/50"
                                    )}
                                >
                                    <p
                                        className={cn(
                                            "text-sm font-medium",
                                            selectedPreset === preset.id
                                                ? "text-primary"
                                                : "text-foreground"
                                        )}
                                    >
                                        {preset.name}
                                    </p>
                                    <p className="text-[11px] text-muted-foreground mt-0.5">
                                        {preset.description}
                                    </p>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Divider */}
                    <div className="h-px bg-border" />

                    {/* Settings Toggles */}
                    <div>
                        <label className="text-sm font-medium text-foreground">
                            Security Settings
                        </label>
                        <p className="text-xs text-muted-foreground mt-0.5 mb-2">
                            Fine-tune what students can and cannot do during the exam.
                        </p>
                        <div className="space-y-0.5">
                            <ToggleRow
                                icon={Monitor}
                                label="Allow Screen Sharing"
                                description="Let students share their screen with other apps"
                                checked={overrides.allowScreenSharing}
                                onChange={(v) => setOverride("allowScreenSharing", v)}
                            />
                            <ToggleRow
                                icon={Monitor}
                                label="Allow Virtual Machine"
                                description="Allow SEB to run inside a VM (VMware, VirtualBox)"
                                checked={overrides.allowVirtualMachine}
                                onChange={(v) => setOverride("allowVirtualMachine", v)}
                            />
                            <ToggleRow
                                icon={Keyboard}
                                label="Allow Spell Check"
                                description="Enable the browser's built-in spell checker"
                                checked={overrides.allowSpellCheck}
                                onChange={(v) => setOverride("allowSpellCheck", v)}
                            />
                            <ToggleRow
                                icon={Globe}
                                label="URL Filtering"
                                description="Restrict navigation to allowed domains only"
                                checked={overrides.urlFilterEnabled}
                                onChange={(v) => setOverride("urlFilterEnabled", v)}
                            />
                            <ToggleRow
                                icon={X}
                                label="Allow Quit"
                                description="Let students quit SEB without a password"
                                checked={overrides.allowQuit}
                                onChange={(v) => setOverride("allowQuit", v)}
                            />
                        </div>
                    </div>

                    {/* Divider */}
                    <div className="h-px bg-border" />

                    {/* Allowed Domains */}
                    <div>
                        <label className="text-sm font-medium text-foreground">
                            Allowed Domains
                        </label>
                        <p className="text-xs text-muted-foreground mt-0.5 mb-2">
                            Domains students can navigate to (comma or newline separated).
                        </p>
                        <textarea
                            value={allowedDomains}
                            onChange={(e) => setAllowedDomains(e.target.value)}
                            rows={2}
                            placeholder="canvas.ufl.edu, *.instructure.com"
                            className="w-full px-3 py-2 rounded-md border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none transition-shadow"
                        />
                    </div>

                    {/* Quit Password */}
                    <div>
                        <label className="text-sm font-medium text-foreground">
                            Quit Password{" "}
                            <span className="font-normal text-muted-foreground">
                (optional)
              </span>
                        </label>
                        <p className="text-xs text-muted-foreground mt-0.5 mb-2">
                            If set, students must enter this password to exit SEB.
                        </p>
                        <input
                            type="text"
                            value={quitPassword}
                            onChange={(e) => setQuitPassword(e.target.value)}
                            placeholder="Leave blank for no quit password"
                            className="w-full h-9 px-3 rounded-md border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-shadow"
                        />
                    </div>

                    {/* Access Code */}
                    <div className="h-px bg-border" />
                    <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-2">
                            Access Code
                        </p>

                        <p className="text-xs text-muted-foreground mb-2">
                            This code is embedded in the SEB config file and set on Canvas.
                            Students won't see it, only SEB can unlock the quiz.
                        </p>

                        <div className="flex items-center gap-2">
                            {isEditingAccessCode ? (
                                <input
                                    ref={accessCodeInputRef}
                                    type="text"
                                    value={accessCode}
                                    onChange={(e) => {
                                        setAccessCode_(e.target.value);     // clear error as they type
                                        if (toast) setToast(null); 
                                    }}

                                    onBlur={() => {
                                        setIsEditingAccessCode(false);
                                        if (accessCode.trim().length < 5) {
                                            showToast("Access code must be at least 5 characters.");
                                        }
                                    }}
                                    className={cn(
                                        "flex-1 px-3 py-2 rounded-md border bg-background font-mono text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-shadow",
                                        toast && "border-destructive focus:ring-destructive/30"
                                    )}
                                />
                            ) : (
                                <code className={cn(
                                    "flex-1 bg-secondary text-foreground px-3 py-2 rounded-md font-mono text-sm",
                                    toast && "ring-1 ring-destructive border border-destructive"
                                )}>
                                    {accessCode}
                                </code>
                            )}
                            <Button
                                variant="outline"
                                size="icon"
                                className="shrink-0"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => {
                                    if (!isEditingAccessCode) {
                                        setIsEditingAccessCode(true);
                                        setTimeout(() => {
                                            accessCodeInputRef.current?.focus();
                                            accessCodeInputRef.current?.select();
                                        }, 0);
                                    } else {
                                        setIsEditingAccessCode(false);
                                        if (accessCode.trim().length < 5) {
                                            showToast("Access code must be at least 5 characters.");
                                        }
                                    }
                                }}
                                title={isEditingAccessCode ? "Done editing" : "Edit access code"}
                            >
                                <Pencil className="w-3.5 h-3.5" />
                            </Button>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-2 px-5 py-3 border-t bg-muted/30">
                    <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>
                        Cancel
                    </Button>
                    <Button
                        variant="default"
                        size="sm"
                        onClick={handleSave}
                        disabled={saving}
                        className="gap-1.5"
                    >
                        {saving ? (
                            <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                Saving…
                            </>
                        ) : (
                            <>
                                <ShieldCheck className="w-3.5 h-3.5" />
                                Save &amp; Download .seb
                            </>
                        )}
                    </Button>
                </div>
            </div>
        </div>
    );
}