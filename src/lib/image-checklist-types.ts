import { AgentConfig } from "@/types/agent-config";

export type ImageType = 'infographic' | 'blog-image' | 'diagram' | 'illustration' | 'chart' | 'photo' | 'custom';

export interface ImageChecklistContext {
  flowTitle?: string;
  flowPurpose?: string;
  agents?: AgentConfig[];
  finalOutput?: string;
  selectedSection?: {
    header: string;
    content: string;
    fullText: string;
  };
  userPrompt?: string;
  includeText: boolean;
  includePeople: boolean;
  includeAnimals: boolean;
  includeCars: boolean;
  isInfographic: boolean;
  aspectRatio: '1:1' | '16:9' | '9:16' | '4:3' | '3:4' | '21:9' | '9:19';
  style: 'professional' | 'minimalist' | 'abstract' | 'modern' | 'classic';
  colorScheme: 'vibrant' | 'muted' | 'monochrome' | 'warm' | 'cool' | 'natural';
  colorForeground?: string;
  colorBackground?: string;
  imageType?: ImageType; // Optional image type for in-content images
}

export interface ImageChecklistItem {
  title: string;
  description: string;
}

export const IMAGE_REQUIREMENTS_ARTIFACT_FILENAME = "image-requirements.json";

/** Overview featured-image pipeline: IMAGE REQUIREMENTS agent output. */
export function formatImageRequirementsArtifact(
  checklist: ImageChecklistItem[],
  meta: { title: string; purpose?: string; keyword?: string },
): string {
  return JSON.stringify(
    {
      agent: "IMAGE REQUIREMENTS",
      title: meta.title,
      purpose: meta.purpose?.trim() || undefined,
      keyword: meta.keyword?.trim() || undefined,
      checklist: checklist.map((item, index) => ({
        index: index + 1,
        title: item.title,
        description: item.description,
      })),
      generatedAt: new Date().toISOString(),
    },
    null,
    2,
  );
}
