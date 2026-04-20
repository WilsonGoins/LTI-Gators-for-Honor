"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { X, ShieldCheck, Monitor, Globe, Lock, Wifi, Copy, Pencil, Check } from "lucide-react";
import { Quiz } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SEBSettingsDialogProps {
  quiz: Quiz | null;
  open: boolean;
  courseId: string;
  onClose: () => void;
  onEdit: (quiz: Quiz) => void;
}

const SECURITY_LABELS: Record<string, { label: string; color: string }> = {
  standard: { label: "Standard", color: "text-sky-600 bg-sky-50 border-sky-200" },
  high: { label: "High Security", color: "text-rose-600 bg-rose-50 border-rose-200" },
  openBook: { label: "Open Book", color: "text-emerald-600 bg-emerald-50 border-emerald-200" },
  testingCenter: { label: "Testing Center", color: "text-violet-600 bg-violet-50 border-violet-200" },
};

function SettingRow({
                      icon: Icon,
                      label,
                      value,
                      enabled,
                    }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value?: string;
  enabled?: boolean;
}) {
  return (
      <div className="flex items-center justify-between py-2.5">
        <div className="flex items-center gap-2.5 text-sm text-foreground">
          <Icon className="w-4 h-4 text-muted-foreground" />
          <span>{label}</span>
        </div>
        {value ? (
            <span className="text-sm font-medium text-foreground">{value}</span>
        ) : (
            <span
                className={cn(
                    "text-xs font-medium px-2 py-0.5 rounded-full",
                    enabled
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        : "bg-secondary text-muted-foreground"
                )}
            >
          {enabled ? "Enabled" : "Disabled"}
        </span>
        )}
      </div>
  );
}

export function SEBSettingsDialog({ quiz, open, courseId, onClose, onEdit }: SEBSettingsDialogProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(message);
    toastTimerRef.current = setTimeout(() => setToast(null), 3000);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  // Close on escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Close on backdrop click
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose();
  };

  if (!open || !quiz || !quiz.sebSettings) return null;

  const settings = quiz.sebSettings;
  const security = SECURITY_LABELS[settings.securityLevel] || SECURITY_LABELS.standard;

  return (
      <div
          ref={overlayRef}
          onClick={handleOverlayClick}
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
          style={{ animationDuration: "0.15s" }}
      >
        {/* Toast notification */}
        {toast && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[60] animate-in slide-in-from-top-2 fade-in duration-200">
              <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 text-white shadow-lg text-sm font-medium">
                <Check className="w-4 h-4 shrink-0" />
                {toast}
              </div>
            </div>
        )}

        <div
            className="bg-card rounded-xl shadow-xl border w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col animate-fade-in"
            style={{ animationDuration: "0.2s" }}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b">
            <div>
              <h2 className="font-semibold text-foreground text-base">
                SEB Configuration
              </h2>
              <p className="text-sm text-muted-foreground mt-0.5">{quiz.title}</p>
            </div>
            <button
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-secondary transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {/* Security level */}
            <div className="flex items-center gap-3">
              <ShieldCheck className="w-5 h-5 text-primary" />
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
                  Security Level
                </p>
                <span
                    className={cn(
                        "inline-flex items-center mt-1 text-sm font-medium px-2.5 py-0.5 rounded-full border",
                        security.color
                    )}
                >
                {security.label}
              </span>
              </div>
            </div>

            {/* Settings grid */}
            <div className="space-y-0 divide-y divide-border">
              <SettingRow
                  icon={Monitor}
                  label="Fullscreen Mode"
                  enabled={settings.browserViewMode === 1}
              />
              <SettingRow
                  icon={Lock}
                  label="Allow Quit"
                  enabled={settings.allowQuit}
              />
              <SettingRow
                  icon={Monitor}
                  label="Screen Sharing"
                  enabled={settings.allowScreenSharing}
              />
              <SettingRow
                  icon={Monitor}
                  label="Virtual Machines"
                  enabled={settings.allowVirtualMachine}
              />
              <SettingRow
                  icon={Globe}
                  label="Spell Check"
                  enabled={settings.allowSpellCheck}
              />
              <SettingRow
                  icon={Wifi}
                  label="URL Filtering"
                  enabled={settings.urlFilterEnabled}
              />
            </div>

            {/* Allowed domains */}
            {settings.urlFilterEnabled && settings.allowedDomains && settings.allowedDomains.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-2">
                    Allowed Domains
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {settings.allowedDomains.map((domain) => (
                        <code
                            key={domain}
                            className="text-xs bg-secondary text-secondary-foreground px-2 py-1 rounded-md font-mono"
                        >
                          {domain}
                        </code>
                    ))}
                  </div>
                </div>
            )}

            {/* Quit password */}
            {settings.quitPassword && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-2">
                    Quit Password
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-secondary text-foreground px-3 py-2 rounded-md font-mono text-sm">
                      {settings.quitPassword}
                    </code>
                    <Button
                        variant="outline"
                        size="icon"
                        className="shrink-0"
                        onClick={() => {
                            navigator.clipboard.writeText(String(settings.quitPassword ?? ""));
                            showToast("Copied!");
                        }}
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
            )}

            {/* Access code — always shown since it is always set */}
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-2">
                Access Code
              </p>
              <code className="block bg-secondary text-foreground px-3 py-2 rounded-md font-mono text-sm">
                {settings.accessCode || "—"}
              </code>
              <p className="text-[11px] text-muted-foreground mt-1.5">
                Students never see this code. SEB enters it automatically.
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between p-5 border-t bg-muted/30">
            <p className="text-xs text-muted-foreground">
              Configured{" "}
              {new Date(settings.configuredAt).toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </p>
            <div className="flex items-center gap-2">
              <Button
                  variant="default"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => onEdit(quiz)}
              >
                <Pencil className="w-3.5 h-3.5" />
                Edit Settings
              </Button>
            </div>
          </div>
        </div>
      </div>
  );
}