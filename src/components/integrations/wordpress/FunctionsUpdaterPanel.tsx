import React, { useCallback, useState } from 'react';
import { Copy, Sparkles } from 'lucide-react';
import { notify } from '@/lib/app-notifications';
import { NOTIFY_CLIPBOARD_UNAVAILABLE, NOTIFY_COPIED, NOTIFY_PASTE_YOUR_FUNCTIONS_PHP_CONTENT_FIRST } from "@/lib/notify-messages";
import type { WordPressSite } from '../types';
import { updateFunctionsPhp } from '@/lib/wordpress-api/update-functions-php';
import { getCyberpunkTextClasses } from './cyberpunk-theme';
import { Button, TextareaField } from "@/ui";

export interface FunctionsUpdaterPanelProps {
  site: WordPressSite;
  disabled?: boolean;
}

export const FunctionsUpdaterPanel: React.FC<FunctionsUpdaterPanelProps> = ({
  site,
  disabled = false,
}) => {
  const [sourcePhp, setSourcePhp] = useState('');
  const [outputPhp, setOutputPhp] = useState('');
  const [changesSummary, setChangesSummary] = useState('');
  const [version, setVersion] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  const siteId = site.id;

  const handleUpdate = useCallback(async () => {
    if (!sourcePhp.trim()) {
      notify.error(NOTIFY_PASTE_YOUR_FUNCTIONS_PHP_CONTENT_FIRST);
      return;
    }

    setIsUpdating(true);
    setOutputPhp('');
    setChangesSummary('');
    setVersion('');

    try {
      const result = await updateFunctionsPhp(sourcePhp, siteId);
      setOutputPhp(result.updatedFunctionsPhp);
      setChangesSummary(result.changesSummary);
      setVersion(result.version);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Update failed';
      notify.error(message);
    } finally {
      setIsUpdating(false);
    }
  }, [siteId, sourcePhp]);

  const handleCopy = useCallback(async () => {
    if (!outputPhp.trim()) {
      return;
    }
    try {
      await navigator.clipboard.writeText(outputPhp);
      notify.success(NOTIFY_COPIED);
    } catch {
      notify.error(NOTIFY_CLIPBOARD_UNAVAILABLE);
    }
  }, [outputPhp]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 pt-2">
      <div className="space-y-2">
        <label htmlFor={`functions-source-${siteId}`} className="text-base font-medium text-foreground">
          Current functions.php
        </label>
        <TextareaField
          id={`functions-source-${siteId}`}
          value={sourcePhp}
          onChange={(e) => setSourcePhp(e.target.value)}
          placeholder="Paste your live functions.php from WP Theme File Editor. Update merges it with the latest FAQ/REST fixes and keeps your site-specific code (maps, shortcodes, custom hooks)…"
          disabled={disabled || isUpdating}
          spellCheck={false}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="run"
          type="button"
          onClick={() => void handleUpdate()}
          disabled={disabled || isUpdating || !sourcePhp.trim()}
        >
          {isUpdating ? (
            null
          ) : (
            <Sparkles className="h-4 w-4 shrink-0" aria-hidden />
          )}
          Update
        </Button>
      </div>

      {outputPhp ? (
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label htmlFor={`functions-output-${siteId}`} className="text-base font-medium text-foreground">
              Updated functions.php
            </label>
            <Button
              variant="quiet"
              type="button"
              onClick={() => void handleCopy()}
            >
              <Copy className="h-4 w-4 shrink-0" aria-hidden />
              Copy
            </Button>
          </div>

          {(version || changesSummary) && (
            <p className={`text-base ${getCyberpunkTextClasses('muted')}`}>
              {version ? `Version ${version}. ` : ''}
              {changesSummary}
            </p>
          )}

          <TextareaField
            placeholder="Functions output"
            id={`functions-output-${siteId}`}
            value={outputPhp}
            readOnly
            spellCheck={false}
          />
        </div>
      ) : null}
    </div>
  );
};
