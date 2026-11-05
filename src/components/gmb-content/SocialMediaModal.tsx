import React, { useCallback, useEffect, useState } from "react";
import { Megaphone, Sparkles } from "lucide-react";
import { ActionButton, DialogShell, SelectField, TextareaField } from "@/ui";
import { notify } from "@/lib/app-notifications";
import { NOTIFY_OPENROUTER_API_KEY_REQUIRED, NOTIFY_SET_GOOGLE_BUSINESS_PROFILE_LOCATION_ID_, notifyPublishedToGbpForX } from "@/lib/notify-messages";
import { BACKEND_API_BASE } from "@/lib/wordpress-api/connection";
import { loadApiKey } from "@/lib/api";
import type { WordPressSite } from "@/components/integrations/types";
import type { GmbContentRow } from "./GmbContentTable";

const PLATFORMS = {
  gmb: {
    label: "Google Business Profile",
    maxChars: 1500,
    maxWords: 150,
    hashtags: false,
    cta: true,
    tone: "local-business conversational",
  },
  facebook: {
    label: "Facebook",
    maxChars: 2000,
    maxWords: 200,
    hashtags: true,
    cta: true,
    tone: "friendly and engaging",
  },
  instagram: {
    label: "Instagram",
    maxChars: 2200,
    maxWords: 200,
    hashtags: true,
    cta: true,
    tone: "visual and aspirational",
  },
  linkedin: {
    label: "LinkedIn",
    maxChars: 3000,
    maxWords: 250,
    hashtags: true,
    cta: true,
    tone: "professional and authoritative",
  },
  x: {
    label: "X (Twitter)",
    maxChars: 280,
    maxWords: 40,
    hashtags: true,
    cta: false,
    tone: "concise and punchy",
  },
} as const;

type PlatformKey = keyof typeof PLATFORMS;
const PLATFORM_OPTIONS = Object.entries(PLATFORMS).map(([value, p]) => ({ value, label: p.label }));
const GENERATE_STATES = ["Generate", "Generating"] as const;
const PUBLISH_STATES = ["Publish to GBP", "Publishing"] as const;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: GmbContentRow | null;
  site: WordPressSite;
}

export const SocialMediaModal: React.FC<Props> = ({
  open,
  onOpenChange,
  row,
  site,
}) => {
  const [platform, setPlatform] = useState<PlatformKey>("gmb");
  const [copy, setCopy] = useState("");
  const [generating, setGenerating] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(false);

  useEffect(() => {
    if (open) {
      setCopy("");
      setPublished(false);
    }
  }, [open, row]);

  const pc = PLATFORMS[platform];
  const charCount = copy.length;
  const isOver = charCount > pc.maxChars;

  const getApiKey = () =>
    loadApiKey()?.trim() ||
    (typeof import.meta !== "undefined"
      ? import.meta.env.VITE_OPENROUTER_API_KEY
      : "") ||
    "";

  const handleGenerate = useCallback(async () => {
    if (!row) return;
    setGenerating(true);
    setPublished(false);
    try {
      const apiKey = getApiKey();
      if (!apiKey) {
        notify.error(NOTIFY_OPENROUTER_API_KEY_REQUIRED);
        return;
      }

      const res = await fetch(
        `${BACKEND_API_BASE}/api/gmb/generate-social-copy`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            siteUrl: site.siteUrl,
            username: site.username,
            appPassword: site.appPassword,
            title: row.title,
            url: row.url,
            excerpt: row.excerpt,
            platform,
            maxChars: pc.maxChars,
            maxWords: pc.maxWords,
            tone: pc.tone,
            hashtags: pc.hashtags,
            cta: pc.cta,
            openRouterApiKey: apiKey,
          }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      if (res.ok && typeof data.copy === "string") {
        setCopy(data.copy);
      } else {
        notify.error(
          typeof data.error === "string"
            ? data.error
            : "Failed to generate copy.",
        );
      }
    } catch (e) {
      notify.error(
        e instanceof Error ? e.message : "Failed to generate copy.",
      );
    } finally {
      setGenerating(false);
    }
  }, [row, site, platform, pc]);

  const handlePublishGbp = useCallback(async () => {
    if (!row || !copy.trim()) return;
    const gbpLocationId = site.gbpLocationId?.trim();
    if (!gbpLocationId) {
      notify.error(NOTIFY_SET_GOOGLE_BUSINESS_PROFILE_LOCATION_ID_);
      return;
    }
    setPublishing(true);
    try {
      const apiKey = getApiKey();
      const res = await fetch(
        `${BACKEND_API_BASE}/api/gmb/publish-from-harness`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            siteUrl: site.siteUrl,
            username: site.username,
            appPassword: site.appPassword,
            gbpLocationId,
            keyword: row.title,
            siteName: site.name,
            blogPostUrl: row.url,
            blogPostTitle: row.title,
            blogPostExcerpt: row.excerpt,
            preGeneratedCopy: copy.trim(),
            publish: true,
            existingGbpPosts: [],
            ...(apiKey ? { openRouterApiKey: apiKey } : {}),
          }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      if (res.ok && data.success) {
        setPublished(true);
        notify.success(notifyPublishedToGbpForX(row.title));
      } else {
        notify.error(
          typeof data.error === "string"
            ? data.error
            : "Failed to publish to GBP.",
        );
      }
    } catch (e) {
      notify.error(
        e instanceof Error ? e.message : "Failed to publish to GBP.",
      );
    } finally {
      setPublishing(false);
    }
  }, [row, site, copy]);

  if (!row) return null;

  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      size="md"
      title="Social Media Module"
      description={row.title}
      actions={
        <>
          <ActionButton
            states={GENERATE_STATES}
            state={generating ? "Generating" : "Generate"}
            icon={Sparkles}
            disabled={generating || publishing}
            onClick={handleGenerate}
          />
          <span className={platform === "gmb" ? "" : "invisible"} aria-hidden={platform !== "gmb"}>
            <ActionButton
              states={PUBLISH_STATES}
              state={publishing ? "Publishing" : "Publish to GBP"}
              icon={Megaphone}
              disabled={platform !== "gmb" || !copy.trim() || generating || publishing || published}
              onClick={handlePublishGbp}
            />
          </span>
        </>
      }
    >
      <SelectField
        placeholder="Platform"
        width="full"
        value={platform}
        options={PLATFORM_OPTIONS}
        onValueChange={(v) => {
          setPlatform(v as PlatformKey);
          setCopy("");
          setPublished(false);
        }}
      />
      <p className="text-base text-muted-foreground">
        Max {pc.maxChars} chars / {pc.maxWords} words
        {pc.hashtags ? " · hashtags" : ""}
        {pc.cta ? " · CTA" : ""}
      </p>
      <div className="flex flex-col gap-0.5 bg-ui-field px-3 py-2">
        <p className="text-base font-semibold text-foreground">{row.title}</p>
        <a
          href={row.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-base text-muted-foreground hover:text-primary"
        >
          {row.url.replace(/^https?:\/\//, "")}
        </a>
      </div>
      <TextareaField
        rows={6}
        aria-label={`${pc.label} Copy`}
        value={copy}
        onChange={(e) => {
          setCopy(e.target.value);
          setPublished(false);
        }}
        placeholder={generating ? "Generating" : `${pc.label} copy. Click Generate to create optimized copy`}
        disabled={generating}
      />
      <p
        className={`text-right text-base tabular-nums ${isOver ? "font-semibold text-ui-danger" : "text-muted-foreground"}`}
      >
        {charCount} / {pc.maxChars} characters
      </p>
      <p className={`h-6 text-base font-semibold text-primary ${published ? "" : "invisible"}`}>
        Published to {pc.label}
      </p>
    </DialogShell>
  );
};