/**
 * WordPress API Media Module
 * Functions for uploading media to WordPress
 */

import { BACKEND_CONNECTION_ERROR, backendApiUrl } from './connection';
import type { WordPressMediaUploadResult } from './types';
import { neoPulseApiHeaders } from "@/lib/neo-pulse-api-headers";

/**
 * Upload media to WordPress Media Library
 * 
 * @param siteUrl - WordPress site URL
 * @param username - WordPress username
 * @param appPassword - WordPress Application Password
 * @param imageBase64 - Base64 encoded image data (with or without data URL prefix)
 * @param filename - Optional filename for the image
 * @param title - Optional title for the media
 * @param alt - Optional alt text for the image (Rank Math: use Focus Keyword in alt)
 *
 * @returns Promise resolving to WordPressMediaUploadResult with media ID and URL
 * 
 * @throws Error if authentication fails, site is unreachable, or backend server is not running
 */
export async function uploadWordPressMedia(
  siteUrl: string,
  username: string,
  appPassword: string,
  imageBase64: string,
  filename?: string,
  title?: string,
  alt?: string
): Promise<WordPressMediaUploadResult> {
  const url = backendApiUrl('/wordpress/upload-media');
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: neoPulseApiHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        siteUrl,
        username,
        appPassword,
        imageBase64,
        filename,
        title,
        ...(alt != null && alt !== '' ? { alt } : {}),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { error: errorText };
      }
      
      throw new Error(errorData.error || errorData.message || `HTTP ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error(BACKEND_CONNECTION_ERROR);
    }
    
    throw error;
  }
}

export type WordPressMediaCatalogItem = {
  id: number;
  title: string;
  alt: string;
  caption: string;
  sourceUrl: string;
};

/**
 * List image media metadata from the connected WordPress site.
 */
export async function listWordPressMedia(
  siteUrl: string,
  username: string,
  appPassword: string,
  maxItems = 200,
): Promise<{ media: WordPressMediaCatalogItem[]; count: number }> {
  const url = backendApiUrl('/wordpress/list-media');
  const response = await fetch(url, {
    method: "POST",
    headers: neoPulseApiHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ siteUrl, username, appPassword, maxItems }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success) {
    throw new Error(data?.error ?? response.statusText ?? "Failed to list WordPress media");
  }
  return { media: data.media ?? [], count: data.count ?? 0 };
}

