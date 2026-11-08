import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ApiKeyCopyButton } from "@/components/ApiKeyCopyButton";
import { maskStoredSecretForDisplay } from "@/lib/mask-stored-secret-display";
import { DASHBOARD_SETTINGS_FIELD_CLASS } from "@/components/manager/dashboard/dashboard-panel-styles";
import { Field } from "@/ui";
import { cn } from "@/lib/utils";

const MASKED_WELL_CLASS = cn(
  DASHBOARD_SETTINGS_FIELD_CLASS,
  "flex h-10 min-h-10 max-w-md flex-1 cursor-text items-center px-3 font-mono tracking-tight",
);

export type WorkspaceApiKeyRowProps = {
  id: string;
  title: string;
  description: ReactNode;
  value: string;
  placeholder: string;
  onChange: (next: string) => void;
  copyEmptyMessage: string;
  copyAriaLabel: string;
};

export function WorkspaceApiKeyRow({
  id,
  title,
  description,
  value,
  placeholder,
  onChange,
  copyEmptyMessage,
  copyAriaLabel,
}: WorkspaceApiKeyRowProps) {
  const [editing, setEditing] = useState(value.length === 0);
  const inputWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (value.length === 0) setEditing(true);
  }, [value]);

  const openEdit = useCallback(() => {
    setEditing(true);
    window.requestAnimationFrame(() => {
      const input = inputWrapRef.current?.querySelector("input");
      input?.focus();
      input?.select();
    });
  }, []);

  const showMasked = value.length > 0 && !editing;

  return (
    <div className="space-y-2">
      <p className="font-semibold text-white">{title}</p>
      <div className="text-base text-white">{description}</div>

      <div className="flex items-center gap-2">
        {showMasked ? (
          <div
            role="button"
            tabIndex={0}
            className={MASKED_WELL_CLASS}
            id={`${id}-masked`}
            aria-label={`${title} saved key (click to edit)`}
            onClick={openEdit}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                openEdit();
              }
            }}
          >
            {maskStoredSecretForDisplay(value)}
          </div>
        ) : (
          <div ref={inputWrapRef} className="min-w-0 max-w-md flex-1">
            <Field
              placeholder={placeholder}
              id={id}
              type="text"
              size="url"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onBlur={() => {
                if (value.length > 0) setEditing(false);
              }}
              aria-label={placeholder}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        )}
        <ApiKeyCopyButton value={value} emptyMessage={copyEmptyMessage} aria-label={copyAriaLabel} />
      </div>
    </div>
  );
}
