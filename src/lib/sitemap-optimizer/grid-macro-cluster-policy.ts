/** Max CSV URLs grouped into one new post + one NEO Pulse redirect destination. */
export type GridMaxUrlsPerPost = 1 | 2 | 3 | 4 | 5;

/** @deprecated Use GridMaxUrlsPerPost */
export type GridTargetPostCount = GridMaxUrlsPerPost;

export function gridMaxSizeClusterSystemRules(maxUrlsPerPost: GridMaxUrlsPerPost): string {
  return `
Grid CSV harness (new post ideas, not WordPress merges):
- Each CSV row is a GSC URL that will redirect to ONE new replacement URL per cluster.
- Group URLs that should share the same new article (same topic, intent, geo when local).
- HARD CEILING: at most ${maxUrlsPerPost} memberPostIds per cluster. Never exceed ${maxUrlsPerPost}.
- Target ${maxUrlsPerPost} URLs per cluster when the topic bucket has enough rows; fill groups to the max before starting the next cluster.
- Minimize the number of new posts: prefer fewer, fuller clusters over many 1–2 URL groups.
- Every allowedPostId must appear exactly once across clusters and singletons.
- ONE city or town per cluster for local URLs.
- Create as many clusters as needed so no cluster has more than ${maxUrlsPerPost} URLs.
`.trim();
}

export function gridMaxSizeClusterSystemPreamble(maxUrlsPerPost: GridMaxUrlsPerPost): string {
  return `You are a senior SEO strategist planning **new cluster-optimized blog posts** from a GSC URL grid.

Your job: group URLs into clusters of **up to ${maxUrlsPerPost} URLs each**. Each cluster becomes one new post and one NEO Pulse redirect redirect target.

${gridMaxSizeClusterSystemRules(maxUrlsPerPost)}

Additional rules:`;
}
