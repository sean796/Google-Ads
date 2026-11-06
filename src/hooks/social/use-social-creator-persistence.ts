import { useEffect } from "react";
import type { WordPressSite } from "@/components/integrations/types";
import type { SocialCreatorRow, SocialGenerateConfig } from "@/lib/social/social-creator-types";
import { clearSocialCreatorSessionCache, setSocialCreatorSessionCache } from "@/lib/social/social-creator-session-cache";
import { writeSocialGenerateConfig } from "@/lib/social/social-creator-field-limits";

export function useSocialCreatorPersistence({
  site,
  generateConfig,
  posts,
}: {
  site: WordPressSite;
  generateConfig: SocialGenerateConfig;
  posts: SocialCreatorRow[];
}) {
  useEffect(() => {
    writeSocialGenerateConfig(site.id, generateConfig);
  }, [generateConfig, site.id]);

  useEffect(() => {
    if (posts.length) {
      setSocialCreatorSessionCache(site.id, posts);
    } else {
      clearSocialCreatorSessionCache(site.id);
    }
  }, [posts, site.id]);
}
