import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Field, SelectField, TextareaField } from "@/ui";

const FIELD =
  'h-9 w-full min-w-0 border-0 bg-muted/55 text-base font-medium text-foreground shadow-none ring-0 outline-none focus-visible:ring-2 focus-visible:ring-primary/45 focus-visible:ring-offset-0';

function FieldPrefix({ children }: { children: ReactNode }) {
  return <span className="pointer-events-none shrink-0 text-muted-foreground">{children}</span>;
}

interface BlogGenerationSettingsProps {
  numberOfBlogs: number;
  setNumberOfBlogs: (value: number) => void;
  optionalPrompt: string;
  setOptionalPrompt: (value: string) => void;
  featuredImagePerBlog: boolean;
  setFeaturedImagePerBlog: (value: boolean) => void;
  featuredImageType: 'ai-generated' | 'google-maps';
  setFeaturedImageType: (value: 'ai-generated' | 'google-maps') => void;
  isGeneratingChecklist: boolean;
  isProcessing: boolean;
  /** GBP Post: only show "how many" count (same field styling as blog generator). */
  countOnly?: boolean;
  countLabel?: string;
  countPlaceholder?: string;
  hideNumberOfBlogs?: boolean;
}

export function BlogGenerationSettings({
  numberOfBlogs,
  setNumberOfBlogs,
  optionalPrompt,
  setOptionalPrompt,
  featuredImagePerBlog,
  setFeaturedImagePerBlog,
  featuredImageType,
  setFeaturedImageType,
  isGeneratingChecklist,
  isProcessing,
  countOnly = false,
  countLabel = "How many blogs",
  countPlaceholder = "How many blogs",
  hideNumberOfBlogs = false,
}: BlogGenerationSettingsProps) {
  if (countOnly) {
    return (
      <div className="rounded-md bg-muted/15 p-2 border-0">
        <div className="min-w-0">
          <Field
            id="number-of-posts-count-only"
            type="number"
            min="1"
            max="50"
            value={numberOfBlogs}
            onChange={(e) => {
              const value = parseInt(e.target.value, 10);
              setNumberOfBlogs(Math.max(1, Math.min(50, value || 1)));
            }}
            disabled={isGeneratingChecklist || isProcessing}
            placeholder={countPlaceholder}
            aria-label={countLabel}
          />
        </div>
      </div>
    );
  }

  const featuredImageMode: FeaturedImageMode = featuredImagePerBlog
    ? featuredImageType
    : 'off';

  const handleFeaturedImageMode = (value: FeaturedImageMode) => {
    if (value === 'off') {
      setFeaturedImagePerBlog(false);
      return;
    }
    setFeaturedImagePerBlog(true);
    setFeaturedImageType(value);
  };

  return (
    <div className="rounded-md bg-muted/15 p-2 border-0">
      <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
        {!hideNumberOfBlogs ? (
        <div className="min-w-0">
          <Field
            id="number-of-blogs"
            type="number"
            min={1}
            step={1}
            value={numberOfBlogs}
            onChange={(e) => {
              const value = parseInt(e.target.value, 10);
              if (!Number.isNaN(value) && value >= 1) setNumberOfBlogs(value);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setNumberOfBlogs(numberOfBlogs + 1);
              } else if (e.key === "ArrowDown" && numberOfBlogs > 1) {
                e.preventDefault();
                setNumberOfBlogs(numberOfBlogs - 1);
              }
            }}
            disabled={isGeneratingChecklist || isProcessing}
            placeholder="How many blogs"
            aria-label="How many blogs"
          />
        </div>
        ) : null}
      </div>

      <TextareaField
        id="optional-prompt"
        placeholder="Optional prompt modifier - tone, audience, style (e.g. beginner-friendly, step-by-step)"
        value={optionalPrompt}
        onChange={(e) => setOptionalPrompt(e.target.value)}
        disabled={isGeneratingChecklist || isProcessing}
        aria-label="Optional prompt modifier"
      />

      <div className="mt-2 min-w-0">
        <SelectField placeholder="Featured image per blog" value={featuredImageMode} onValueChange={(v) => handleFeaturedImageMode(v as FeaturedImageMode)} disabled={isGeneratingChecklist || isProcessing} options={[{ value: "off", label: "Off - no featured image" }, { value: "ai-generated", label: "AI generated" }, { value: "google-maps", label: "Google Maps (needs entity)" }]} />
      </div>
    </div>
  );
}

type FeaturedImageMode = 'off' | 'ai-generated' | 'google-maps';
