import { type WordPressSite } from "../types";

export interface UnifiedContentSelectorProps {
  site: WordPressSite;
  value: string | string[];
  onValueChange: (url: string | string[]) => void;
  postType: 'post' | 'service-area' | 'page' | 'both';
  onPostTypeChange: (type: 'post' | 'service-area' | 'page' | 'both') => void;
  disabled?: boolean;
  multiSelect?: boolean;
  onPostDataChange?: (postData: { id: number; subtype: string; link: string; slug?: string; endpoint?: string } | null) => void;
  /** `cyberpunk` matches Elementor / integrations; `default` matches manager Card theme */
  theme?: 'cyberpunk' | 'default';
}
