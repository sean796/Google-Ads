import React, { useState } from "react";
import type { ChatUserPreferences } from "@/lib/chat-preferences-types";
import { playChatTestSound, queueChatTestNotification, chatNotificationPermissionLabel } from "@/lib/chat-test-notification";
import { Button, Field, CheckField, SelectField } from "@/ui";

type Props = {
  draft: ChatUserPreferences;
  onChangeNotifications: (patch: Partial<ChatUserPreferences["notifications"]>) => void;
  onChangeBehavior: (patch: Partial<ChatUserPreferences["behavior"]>) => void;
};

function ToggleRow({
  label,
  checked,
  onChecked,
}: {
  label: string;
  checked: boolean;
  onChecked: (v: boolean) => void;
}): React.ReactElement {
  return (
    <CheckField label={label} checked={checked} onCheckedChange={onChecked} />
  );
}

function TagInput({
  label,
  values,
  onChange,
}: {
  label: string;
  values: string[];
  onChange: (next: string[]) => void;
}): React.ReactElement {
  const [input, setInput] = React.useState("");

  const addTags = (raw: string) => {
    const parts = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length === 0) return;
    const merged = [...values];
    for (const p of parts) {
      if (!merged.some((v) => v.toLowerCase() === p.toLowerCase())) merged.push(p);
    }
    onChange(merged);
    setInput("");
  };

  return (
    <div className="space-y-2">
      <p className="text-base text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-2">
        {values.map((tag) => (
          <Button
            variant="quiet"
            key={tag}
            onClick={() => onChange(values.filter((v) => v !== tag))}
          >
            {tag} ×
          </Button>
        ))}
      </div>
      <Field
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            addTags(input);
          }
        }}
        onBlur={() => {
          if (input.trim()) addTags(input);
        }}
        placeholder="Add and press Enter"
      />
    </div>
  );
}

export function ChatPrefsNotificationsSection({
  draft,
  onChangeNotifications,
  onChangeBehavior,
}: Props): React.ReactElement {
  const { notifications, behavior } = draft;
  const [testStatus, setTestStatus] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  const runNotificationTest = async () => {
    setTesting(true);
    setTestStatus(null);
    try {
      const result = await queueChatTestNotification();
      if (result.ok && notifications.soundEnabled) {
        playChatTestSound(notifications.soundPreset);
      }
      setTestStatus(result.message);
    } finally {
      setTesting(false);
    }
  };

  return (
    <>
      <section className="space-y-2">
        <h3 className="text-base font-semibold">Notifications</h3>
        <ToggleRow label="Mentions" checked={notifications.mentions} onChecked={(v) => onChangeNotifications({ mentions: v })} />
        <ToggleRow label="Direct messages" checked={notifications.dms} onChecked={(v) => onChangeNotifications({ dms: v })} />
        <ToggleRow label="Threads" checked={notifications.threads} onChecked={(v) => onChangeNotifications({ threads: v })} />
        <ToggleRow label="Calls" checked={notifications.calls} onChecked={(v) => onChangeNotifications({ calls: v })} />
        <ToggleRow
          label="All channel messages"
          checked={notifications.channelMessages}
          onChecked={(v) => onChangeNotifications({ channelMessages: v })}
        />
        <ToggleRow
          label="Desktop alerts"
          checked={notifications.desktopAlerts}
          onChecked={(v) => {
            onChangeNotifications({ desktopAlerts: v });
            if (v && typeof Notification !== "undefined" && Notification.permission === "default") {
              void Notification.requestPermission();
            }
          }}
        />
        <ToggleRow
          label="Sound"
          checked={notifications.soundEnabled}
          onChecked={(v) => onChangeNotifications({ soundEnabled: v })}
        />
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Button
            type="button"
            disabled={testing}
            onClick={() => void runNotificationTest()}
          >
            Test notification
          </Button>
          <span className="text-base text-muted-foreground">
            Browser permission: {chatNotificationPermissionLabel()}
          </span>
          {testStatus ? (
            <span className="w-full text-base text-muted-foreground">{testStatus}</span>
          ) : null}
        </div>
        {notifications.soundEnabled ? (
          <SelectField
            placeholder="Sound preset"
            value={notifications.soundPreset}
            onValueChange={(v) => onChangeNotifications({ soundPreset: v as typeof notifications.soundPreset })}
            options={[
              { value: "subtle", label: "Subtle" },
              { value: "classic", label: "Classic" },
              { value: "none", label: "None" },
            ]}
            width="full"
          />
        ) : null}
        <TagInput
          label="Keyword watch"
          values={notifications.keywordWatch}
          onChange={(keywordWatch) => onChangeNotifications({ keywordWatch })}
        />
        <TagInput
          label="Topic watch"
          values={notifications.topicWatch}
          onChange={(topicWatch) => onChangeNotifications({ topicWatch })}
        />
      </section>
      <section className="space-y-2">
        <h3 className="text-base font-semibold">Behavior</h3>
        <ToggleRow
          label="Enter to send"
          checked={behavior.enterToSend}
          onChecked={(v) => onChangeBehavior({ enterToSend: v })}
        />
        <ToggleRow
          label="Link previews"
          checked={behavior.showLinkPreviews}
          onChecked={(v) => onChangeBehavior({ showLinkPreviews: v })}
        />
        <ToggleRow
          label="Typing indicators"
          checked={behavior.showTypingIndicators}
          onChecked={(v) => onChangeBehavior({ showTypingIndicators: v })}
        />
        <ToggleRow
          label="Collapse threads by default"
          checked={behavior.collapseThreadsByDefault}
          onChecked={(v) => onChangeBehavior({ collapseThreadsByDefault: v })}
        />
      </section>
    </>
  );
}
