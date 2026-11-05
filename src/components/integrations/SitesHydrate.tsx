import { useEffect } from "react";
import { useWordPressSites } from "@/hooks/use-wordpress-sites";
import { restoreSitesFromServerMirrorIfEmpty } from "@/components/integrations/storage";

/** Pull sites.json from server when browser storage has no usable properties after boot. */
export function SitesHydrate(): null {
  return null;
}
