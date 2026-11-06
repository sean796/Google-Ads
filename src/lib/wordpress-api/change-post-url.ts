import { BACKEND_API_BASE, BACKEND_CONNECTION_ERROR } from './connection';
import { neoPulseApiHeaders } from "@/lib/neo-pulse-api-headers";

export type ChangeWordPressPostUrlResult = {
  ok: boolean;
  permalink?: string;
  slug?: string;
  method?: string;
  error?: string;
};

export async function changeWordPressPostUrl(
  siteUrl: string,
  username: string,
  appPassword: string,
  postId: number,
  slug: string,
  options?: {
    postType?: string;
    postTypeEndpoint?: string;
    createRedirect?: boolean;
  },
): Promise<ChangeWordPressPostUrlResult> {
  const url = `${BACKEND_API_BASE}/api/wordpress/change-post-url`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: neoPulseApiHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        siteUrl,
        username,
        appPassword,
        postId,
        slug: slug.trim(),
        postType: options?.postType,
        postTypeEndpoint: options?.postTypeEndpoint,
        createRedirect: options?.createRedirect ?? false,
      }),
    });

    const data = (await response.json().catch(() => ({}))) as ChangeWordPressPostUrlResult & {
      error?: string;
    };

    if (!response.ok) {
      if (response.status === 404) {
        return {
          ok: false,
          error:
            data.error ||
            "WordPress slug route not found. Restart the NEO Pulse backend server, then try Update WP again.",
        };
      }
      return { ok: false, error: data.error || `HTTP ${response.status}` };
    }

    return {
      ok: data.ok !== false,
      permalink: data.permalink,
      slug: data.slug,
      method: data.method,
      error: data.error,
    };
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error(BACKEND_CONNECTION_ERROR);
    }
    throw error;
  }
}
