export type PostCreatorProofSlotKey =
  | "checklist"
  | "keyword"
  | "blueprint"
  | "content"
  | "image"
  | "wordpress"
  | "live";

export type PostCreatorProofSlotStatus = "waiting" | "generating" | "ready";

export type PostCreatorProofSlot = {
  key: PostCreatorProofSlotKey;
  label: string;
  status: PostCreatorProofSlotStatus;
  href?: string;
  fileName?: string;
  externalUrl?: string;
};

export type PostCreatorProofRow = {
  rowIndex: number;
  label: string;
  keyword?: string;
  slots: PostCreatorProofSlot[];
};

export type PostCreatorContentBucketProofFile = {
  bucket: string;
  name: string;
  href: string;
};

export type PostCreatorProofSnapshot = {
  postCount: number;
  activeRowIndex: number | null;
  rows: PostCreatorProofRow[];
  contentBucketFiles?: PostCreatorContentBucketProofFile[];
};


export function postCreatorProofRowLabel(
  rowIndex: number,
  postCount: number,
  keyword?: string,
): string {
  const kw = keyword?.trim();
  if (kw) return kw;
  if (postCount > 1) return `Post ${rowIndex + 1}`;
  return "";
}

export const POST_CREATOR_PROOF_SLOTS: Array<{
  key: PostCreatorProofSlotKey;
  label: string;
  matchFileName: (name: string) => boolean;
}> = [
  {
    key: "keyword",
    label: "Keyword research",
    matchFileName: (name) =>
      /keyword-research|dfs_research|sem_rush|seo-research/i.test(name),
  },
  {
    key: "checklist",
    label: "Checklist",
    matchFileName: (name) => /blog-checklist|blog_checklist/i.test(name),
  },
  {
    key: "blueprint",
    label: "Blueprint",
    matchFileName: (name) => /^blueprint-/i.test(name),
  },
  {
    key: "content",
    label: "Content",
    matchFileName: (name) => /^content-/i.test(name) && /\.md$/i.test(name),
  },
  {
    key: "image",
    label: "Featured image",
    matchFileName: (name) =>
      /featured-image/i.test(name) ||
      /\.(png|jpe?g|webp)$/i.test(name),
  },
  {
    key: "wordpress",
    label: "WordPress upload",
    matchFileName: (name) => /wordpress-post/i.test(name),
  },
  {
    key: "live",
    label: "Published URL",
    matchFileName: () => false,
  },
];
