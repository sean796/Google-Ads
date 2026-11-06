import React, { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

import { Button, Field, SelectField, SwitchField, TextareaField, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/ui";
import { useTeam } from "@/contexts/TeamContext";
import { isNeoPulseBotMember } from "@/lib/chat-neo-pulse";
import type { TaskExecutionPayload } from "@/lib/tasks-types";

const FORGE_RECIPIENT_MENU = "z-[200] border-0 bg-black text-foreground shadow-xl";
const FORGE_RECIPIENT_MENU_ITEM = "text-base focus:bg-ui-field focus:text-foreground data-[highlighted]:bg-ui-field data-[highlighted]:text-foreground";

const CUSTOM_RECIPIENT = "__custom__";

export type AutomationEmailDeliveryFieldsProps = {
  payload: TaskExecutionPayload;
  disabled?: boolean;
  onChange: (patch: Partial<TaskExecutionPayload>) => void;
};

export function AutomationEmailDeliveryFields({
  payload,
  disabled = false,
  onChange,
}: AutomationEmailDeliveryFieldsProps): React.ReactElement {
  const { members } = useTeam();

  const teamRecipients = useMemo(() => {
    const seen = new Set<string>();
    const rows: { email: string; label: string }[] = [];
    for (const member of members) {
      if (isNeoPulseBotMember(member)) continue;
      const email = member.email?.trim();
      if (!email) continue;
      const key = email.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const name = member.displayName?.trim();
      rows.push({
        email,
        label: name ? `${name} (${email})` : email,
      });
    }
    return rows.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
  }, [members]);

  const recipientEmail = (payload.automationEmailTo ?? "").trim();
  const matchedRecipient = useMemo(
    () => teamRecipients.find((row) => row.email.toLowerCase() === recipientEmail.toLowerCase()),
    [recipientEmail, teamRecipients],
  );

  const [customMode, setCustomMode] = useState(false);
  const customInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!recipientEmail) {
      setCustomMode(false);
      return;
    }
    setCustomMode(!matchedRecipient);
  }, [matchedRecipient, recipientEmail]);

  useEffect(() => {
    if (!customMode) return;
    customInputRef.current?.focus();
  }, [customMode]);

  const selectValue = matchedRecipient?.email ?? "";

  const pickTeamRecipient = (email: string) => {
    setCustomMode(false);
    onChange({ automationEmailTo: email });
  };

  const pickCustomRecipient = () => {
    setCustomMode(true);
    if (matchedRecipient) onChange({ automationEmailTo: "" });
  };

  return (
    <div className="flex flex-col gap-1.5 pt-1">
      {customMode ? (
        <div className="flex items-center gap-0.5">
          <Field
            ref={customInputRef}
            type="email"
            placeholder="To, e.g. lead@company.com"
            aria-label="Custom email recipient"
            value={payload.automationEmailTo ?? ""}
            disabled={disabled}
            onChange={(event) => onChange({ automationEmailTo: event.target.value })}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" icon={ChevronDown} aria-label="Choose team member" disabled={disabled} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className={FORGE_RECIPIENT_MENU}>
              {teamRecipients.map((row) => (
                <DropdownMenuItem
                  key={row.email}
                  className={FORGE_RECIPIENT_MENU_ITEM}
                  onSelect={() => pickTeamRecipient(row.email)}
                >
                  {row.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : (
        <SelectField
          placeholder="To, select team member"
          width="full"
          value={selectValue}
          disabled={disabled}
          options={[
            ...teamRecipients.map((row) => ({ value: row.email, label: row.label })),
            { value: CUSTOM_RECIPIENT, label: "Custom email" },
          ]}
          onValueChange={(next) => {
            if (next === CUSTOM_RECIPIENT) {
              pickCustomRecipient();
              return;
            }
            pickTeamRecipient(next);
          }}
        />
      )}
      <Field
        placeholder="Subject, e.g. {siteName} automation summary ({date})"
        aria-label="Subject"
        value={payload.automationEmailSubject ?? ""}
        disabled={disabled}
        onChange={(event) => onChange({ automationEmailSubject: event.target.value })}
      />
      <TextareaField
        rows={3}
        placeholder="Message, e.g. Hi, your {automationTitle} run for {siteName} is complete."
        aria-label="Message"
        value={payload.automationEmailMessage ?? ""}
        disabled={disabled || payload.automationEmailAiIntro === true}
        onChange={(event) => onChange({ automationEmailMessage: event.target.value })}
      />
      <SwitchField
        label="Talking script for highlights"
        checked={payload.automationEmailAiIntro === true}
        disabled={disabled}
        onCheckedChange={(checked) => onChange({ automationEmailAiIntro: checked })}
      />
    </div>
  );
}