import type { SiteInventoryBulkRow } from './wordpress-api/types';

export interface CachedPost {
  id: number;
  slug: string;
  title: string;
  excerpt: string;
  link: string;
  date_gmt: string;
  postType?: 'post' | 'page' | 'service-area';
}

export interface SiteDigest {
  siteId: string;
  topicClusters: string;
  linkablePostsCompact: string;
  generatedAt: number;
}

export interface SiteContentCache {
  siteId: string;
  siteUrl: string;
  posts: CachedPost[];
  createdAt: number;
  /** word (lowercase) -> posts that contain that word in title (for O(1) candidate lookup) */
  titleIndex: Map<string, CachedPost[]>;
  /** normalized URL (lowercase, no trailing slash) -> post for O(1) URL lookup */
  urlIndex: Map<string, CachedPost>;
  /** optional AI-compressed site summary for token-efficient prompts */
  siteDigest?: SiteDigest;
}


/** Tokenize title into lowercase words (non-empty). */
function tokenizeTitle(title: string): string[] {
  return title
    .toLowerCase()
    .split(/\W+/)
    .filter(Boolean);
}

/**
 * Build title index (word -> posts) and url index (normalized URL -> post) for O(1) lookups.
 */
export function buildSearchIndexes(posts: CachedPost[]): {
  titleIndex: Map<string, CachedPost[]>;
  urlIndex: Map<string, CachedPost>;
} {
  const titleIndex = new Map<string, CachedPost[]>();
  const urlIndex = new Map<string, CachedPost>();

  for (const post of posts) {
    for (const word of tokenizeTitle(post.title)) {
      const arr = titleIndex.get(word) ?? [];
      arr.push(post);
      titleIndex.set(word, arr);
    }
    if (post.link?.trim()) {
      const norm = post.link.trim().toLowerCase().replace(/\/+$/, '');
      urlIndex.set(norm, post);
      urlIndex.set(norm + '/', post);
    }
  }

  return { titleIndex, urlIndex };
}

export function mapInventoryRowsToCachedPosts(rows: SiteInventoryBulkRow[]): CachedPost[] {
  const seen = new Set<string>();
  const out: CachedPost[] = [];
  for (const row of rows) {
    const link = row.url?.trim();
    if (!link) continue;
    const norm = link.toLowerCase().replace(/\/+$/, '');
    if (seen.has(norm)) continue;
    seen.add(norm);
    const coll = row.collection ?? 'post';
    const postType: CachedPost['postType'] =
      coll === 'pages' || coll === 'page'
        ? 'page'
        : coll !== 'posts' && coll !== 'post'
          ? 'service-area'
          : 'post';
    out.push({
      id: row.id ?? 0,
      slug: row.slug ?? '',
      title: row.fields?.title ?? '',
      excerpt: (row.fields?.excerpt ?? '').replace(/<[^>]+>/g, '').substring(0, 200),
      link,
      date_gmt: row.date_gmt ?? '',
      postType,
    });
  }
  return out;
}
