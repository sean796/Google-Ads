import { useMemo, useState } from "react";
import type { SocialCreatorRow } from "@/lib/social/social-creator-types";
import type { SocialCreatorSortColumn } from "@/hooks/social/social-creator-workspace-types";

export function useSocialCreatorDisplayPosts({ posts }: { posts: SocialCreatorRow[] }) {
  const [sortColumn, setSortColumn] = useState<SocialCreatorSortColumn>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const displayPosts = useMemo(() => {
    const sorted = [...posts];
    if (sortColumn === "title") {
      sorted.sort((a, b) => {
        const av = (a.focusKeyword || "").toLowerCase();
        const bv = (b.focusKeyword || "").toLowerCase();
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      });
    } else if (sortColumn === "date") {
      sorted.sort((a, b) => {
        const av = a.createdAt || "";
        const bv = b.createdAt || "";
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      });
    }
    return sorted;
  }, [posts, sortColumn, sortDir]);

  return { displayPosts, sortColumn, setSortColumn, sortDir, setSortDir };
}
