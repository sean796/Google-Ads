import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { MOBILE_PUSH_ACTIONS } from "@/lib/mobile-push/notification-actions";
import {
  fetchMobilePushPreferences,
  patchMobilePushPreferences,
} from "@/lib/mobile-push/push-api";
import type { MobilePushPrefs } from "@/lib/mobile-push/types";
import { cn } from "@/lib/utils";
import { Button, CheckField } from "@/ui";

type MobilePushPrefsSheetProps = {
  open: boolean;
  onClose: () => void;
};

export function MobilePushPrefsSheet({ open, onClose }: MobilePushPrefsSheetProps) {
  const [prefs, setPrefs] = useState<MobilePushPrefs | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);
    void fetchMobilePushPreferences()
      .then((next) => {
        if (!cancelled) setPrefs(next);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load notification settings");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open) return null;

  const togglePref = (prefKey: keyof MobilePushPrefs) => {
    if (!prefs) return;
    const nextValue = !prefs[prefKey];
    setPrefs({ ...prefs, [prefKey]: nextValue });
    setSavingKey(prefKey);
    void patchMobilePushPreferences({ [prefKey]: nextValue })
      .then(setPrefs)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Could not save setting");
        setPrefs((current) => (current ? { ...current, [prefKey]: !nextValue } : current));
      })
      .finally(() => setSavingKey(null));
  };

  return (
    <div className="mobile-push-sheet fixed inset-0 z-50 flex flex-col bg-black/90">
      <div className="flex shrink-0 items-center justify-between gap-2 px-3 py-3">
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-white" aria-hidden />
          <h2 className="text-base font-bold text-white">Phone notifications</h2>
        </div>
        <Button
          variant="quiet"
          onClick={onClose}
        >
          Done
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-6">
        {error ? <p className="mb-3 text-sm text-ui-danger-hover">{error}</p> : null}
        {!prefs ? (
          <p className="text-base text-muted-foreground">Loading settings…</p>
        ) : (
          <div className="flex flex-col gap-2">
            {MOBILE_PUSH_ACTIONS.map((action) => (
              <label
                key={action.id}
                className="mobile-push-pref-row flex min-h-12 items-center justify-between gap-3 rounded-xl bg-[hsl(240_4%_14%)] px-3 py-2"
              >
                <span className="min-w-0">
                  <span className="block text-base font-semibold text-white">{action.label}</span>
                  <span className="block text-sm text-muted-foreground">{action.description}</span>
                </span>
                <CheckField checked={prefs[action.prefKey]} disabled={savingKey === action.prefKey} onCheckedChange={() => togglePref(action.prefKey)} aria-label={action.label} />
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
