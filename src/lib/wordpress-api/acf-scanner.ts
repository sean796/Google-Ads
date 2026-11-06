/**
 * ACF Field Scanner - REST API Only
 * Scans ACF fields directly via REST API without scanning post content
 */

import { BACKEND_API_BASE } from './connection';

/** Serialize ACF value to display string; avoid [object Object] for image/object fields */
function serializeAcfValue(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (typeof o.url === 'string' && o.url) return o.url;
    if (typeof o.id === 'number') return `Image ID: ${o.id}`;
    if (typeof o.id === 'string') return `Image ID: ${o.id}`;
  }
  return String(v);
}
import type { WordPressSite } from '@/components/integrations/types';
import type { ScannedPost } from './content-scanner';
import type { ACFFieldDefinition, ACFFieldGroup } from './acf-discovery';
import { neoPulseApiHeaders } from "@/lib/neo-pulse-api-headers";

export interface ACFFieldValue {
  fieldName: string;
  fieldLabel: string;
  fieldType: string;
  value: unknown;
  postId?: number; // Optional for Options Page fields
  postType?: string; // Optional for Options Page fields
  postTitle?: string; // Optional for Options Page fields
  postLink?: string; // Optional for Options Page fields
  optionsPageSlug?: string; // For Options Page fields
}

export interface ACFScanResult {
  success: boolean;
  fields: ACFFieldValue[];
  fieldGroups: Array<{
    name: string;
    label: string;
    type: string;
    occurrenceCount: number;
    sampleValue: unknown;
  }>;
  error?: string;
}

/**
 * Extract Options Page slugs from ACF field group location rules
 */
function extractOptionsPageSlugs(fieldGroups: ACFFieldGroup[]): string[] {
  const slugs = new Set<string>();
  
  for (const group of fieldGroups) {
    if (group.location && Array.isArray(group.location)) {
      for (const ruleGroup of group.location) {
        if (Array.isArray(ruleGroup)) {
          for (const rule of ruleGroup) {
            if (rule.param === 'options_page' && rule.operator === '==') {
              // Handle Options Page value - convert to "options" slug
              // If value is "Contact Information" or similar, use "options"
              // The ACF v3 endpoint uses "options" as the slug
              const slug = rule.value === 'Contact Information' || rule.value.toLowerCase().includes('contact') 
                ? 'options' 
                : rule.value.toLowerCase();
              slugs.add(slug);
            }
          }
        }
      }
    }
  }
  
  return Array.from(slugs);
}

/**
 * Scan ACF fields from Options Page ONLY via REST API
 * NO post type scanning, NO individual post iteration
 */
export async function scanACFOptionsPageOnly(
  site: WordPressSite,
  optionsPageSlug?: string, // Optional: if not provided, will extract from field groups
  options: {
    onProgress?: (message: string, progress: number) => void;
  } = {}
): Promise<ACFScanResult> {
  const { onProgress } = options;

  try {
    // Step 1: Get ACF field groups to find Options Page field groups
    onProgress?.('Getting ACF field groups from REST API...', 10);
    
    const discoverUrl = `${BACKEND_API_BASE}/api/wordpress/discover-acf-field-groups`;
    const requestBody = {
      siteUrl: site.siteUrl,
      username: site.username,
      appPassword: site.appPassword,
      sampleSize: 0, // Don't scan posts, just get field groups
    };
        const discoverResponse = await fetch(discoverUrl, {
      method: 'POST',
      headers: neoPulseApiHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(requestBody),
    });

    
    if (!discoverResponse.ok) {
            throw new Error(`Failed to discover ACF field groups: ${discoverResponse.statusText}`);
    }

    const discoverData = await discoverResponse.json();
    
        
    if (!discoverData.success) {
            throw new Error(discoverData.error || 'Failed to discover ACF field groups');
    }

    const fieldGroups = (discoverData.fieldGroups || []) as ACFFieldGroup[];
    const fieldDefinitions = (discoverData.fields || []) as ACFFieldDefinition[];
    
    // Step 2: Extract Options Page slug(s) from location rules
    let targetSlug = optionsPageSlug;
    if (!targetSlug) {
      const slugs = extractOptionsPageSlugs(fieldGroups);
      if (slugs.length === 0) {
        // Default to "options" - the ACF v3 endpoint uses this slug
        targetSlug = 'options';
        onProgress?.('No Options Page found in location rules, using default: options', 20);
      } else {
        targetSlug = slugs[0]; // Use first found slug
        onProgress?.(`Found Options Page slug from location rules: ${targetSlug}`, 20);
      }
    }

    // Step 3: Query Options Page fields directly
    onProgress?.(`Scanning Options Page: ${targetSlug}...`, 30);
    
    const optionsPageUrl = `${BACKEND_API_BASE}/api/wordpress/get-acf-options-page-fields`;
    const optionsPageResponse = await fetch(optionsPageUrl, {
      method: 'POST',
      headers: neoPulseApiHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        siteUrl: site.siteUrl,
        username: site.username,
        appPassword: site.appPassword,
        pageSlug: targetSlug,
      }),
    });

    if (!optionsPageResponse.ok) {
      throw new Error(`Failed to get Options Page fields: ${optionsPageResponse.statusText}`);
    }

    const optionsPageData = await optionsPageResponse.json();
    
    if (!optionsPageData.success) {
      throw new Error(optionsPageData.error || 'Failed to get ACF fields from Options Page');
    }

    const acfFields = optionsPageData.fields || {};
    
    if (Object.keys(acfFields).length === 0) {
      throw new Error(`No ACF fields found on Options Page "${targetSlug}". Ensure the Options Page exists and has fields.`);
    }

    onProgress?.(`Found ${Object.keys(acfFields).length} ACF fields on Options Page`, 50);

    // Step 4: Process ACF values from Options Page
    onProgress?.('Processing ACF fields from Options Page...', 60);
    
    const allACFFields: ACFFieldValue[] = [];
    const fieldValueMap = new Map<string, {
      fieldName: string;
      fieldLabel: string;
      fieldType: string;
      value: unknown;
    }>();

    for (const [fieldName, fieldValue] of Object.entries(acfFields)) {
      if (fieldValue === null || fieldValue === undefined || fieldValue === '') {
        continue;
      }

      const valueStr = serializeAcfValue(fieldValue);
      if (!valueStr) continue;

      // Find field definition
      const fieldDef = fieldDefinitions.find((f) => f.name === fieldName);
      
      const fieldLabel = fieldDef?.label || fieldName.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase());
      const fieldType = fieldDef?.type || 'text';

      fieldValueMap.set(fieldName, {
        fieldName,
        fieldLabel,
        fieldType,
        value: valueStr,
      });

      // Add to all fields array
      allACFFields.push({
        fieldName,
        fieldLabel,
        fieldType,
        value: valueStr,
        optionsPageSlug: targetSlug,
      });
    }

    // Convert field map to field groups (value is already serialized)
    const fieldGroupsResult = Array.from(fieldValueMap.values()).map(fieldInfo => ({
      name: fieldInfo.fieldName,
      label: fieldInfo.fieldLabel,
      type: fieldInfo.fieldType,
      occurrenceCount: 1, // Options Page fields appear once
      sampleValue: fieldInfo.value as string,
    }));

    onProgress?.('ACF Options Page scan complete!', 100);

    return {
      success: true,
      fields: allACFFields,
      fieldGroups: fieldGroupsResult,
    };
  } catch (error) {
    return {
      success: false,
      fields: [],
      fieldGroups: [],
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Scan ACF fields directly from REST API
 * Gets field groups first, then gets ACF values from posts
 * @deprecated Use scanACFOptionsPageOnly instead
 */
export async function scanACFFieldsOnly(
  site: WordPressSite,
  options: {
    onProgress?: (message: string, progress: number) => void;
  } = {}
): Promise<ACFScanResult> {
  const { onProgress } = options;

  try {
    // Step 1: Discover ACF field groups via REST API
    onProgress?.('Discovering ACF field groups via REST API...', 10);
    
    const discoverUrl = `${BACKEND_API_BASE}/api/wordpress/discover-acf-field-groups`;
    const discoverResponse = await fetch(discoverUrl, {
      method: 'POST',
      headers: neoPulseApiHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        siteUrl: site.siteUrl,
        username: site.username,
        appPassword: site.appPassword,
        sampleSize: 50, // Get more samples to find all fields
      }),
    });

    if (!discoverResponse.ok) {
      throw new Error(`Failed to discover ACF fields: ${discoverResponse.statusText}`);
    }

    const discoverData = await discoverResponse.json();
    
    if (!discoverData.success) {
      throw new Error(discoverData.error || 'Failed to discover ACF field groups');
    }

    const fieldDefinitions = (discoverData.fields || []) as ACFFieldDefinition[];
    onProgress?.(`Found ${fieldDefinitions.length} ACF field definitions`, 20);

    // Step 2: Get all post types
    onProgress?.('Getting post types...', 25);
    const postTypesUrl = `${BACKEND_API_BASE}/api/wordpress/get-post-types`;
    const postTypesResponse = await fetch(postTypesUrl, {
      method: 'POST',
      headers: neoPulseApiHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        siteUrl: site.siteUrl,
        username: site.username,
        appPassword: site.appPassword,
      }),
    });

    let postTypes: string[] = ['post', 'page'];
    if (postTypesResponse.ok) {
      const postTypesData = await postTypesResponse.json();
      postTypes = (postTypesData.postTypes || []).filter((type: string) => 
        !type.startsWith('wp_') || type === 'wp_block'
      );
    }

    onProgress?.(`Scanning ${postTypes.length} post types for ACF values...`, 30);

    // Step 3: Get ACF field values from posts via REST API
    const allACFFields: ACFFieldValue[] = [];
    const fieldValueMap = new Map<string, {
      fieldName: string;
      fieldLabel: string;
      fieldType: string;
      values: Set<string>;
      posts: Array<{ postId: number; postType: string; postTitle: string; postLink: string }>;
    }>();

    for (let i = 0; i < postTypes.length; i++) {
      const postType = postTypes[i];
      const postTypeEndpoint = postType === 'post' ? 'posts' : postType === 'page' ? 'pages' : postType;
      
      onProgress?.(`Scanning ${postType} for ACF values...`, 30 + (i / postTypes.length) * 60);

      // Get posts with ACF fields
      const postsUrl = `${BACKEND_API_BASE}/api/wordpress/get-posts-list`;
      let page = 1;
      let hasMore = true;
      const maxPosts = 100; // Limit to avoid too many requests

      while (hasMore && page <= 10) {
        const postsResponse = await fetch(postsUrl, {
          method: 'POST',
          headers: neoPulseApiHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            siteUrl: site.siteUrl,
            username: site.username,
            appPassword: site.appPassword,
            postType,
            postTypeEndpoint,
            perPage: 100,
            page,
            status: 'publish',
          }),
        });

        if (!postsResponse.ok) {
          const errorText = await postsResponse.text();
          // Skip post types that don't exist
          if (postsResponse.status === 404 || errorText.includes('not found')) {
            hasMore = false;
            break;
          }
          throw new Error(`Failed to get posts: ${errorText}`);
        }

        const postsData = await postsResponse.json();
        const posts = postsData.posts || [];

        if (posts.length === 0) {
          hasMore = false;
          break;
        }

        // Get ACF fields for each post
        for (const post of posts) {
          const acfUrl = `${BACKEND_API_BASE}/api/wordpress/get-acf-fields`;
          const acfResponse = await fetch(acfUrl, {
            method: 'POST',
            headers: neoPulseApiHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({
              siteUrl: site.siteUrl,
              username: site.username,
              appPassword: site.appPassword,
              postId: post.id,
              postType,
              postTypeEndpoint,
            }),
          });

          if (acfResponse.ok) {
            const acfData = await acfResponse.json();
            if (acfData.success && acfData.fields) {
              // Process each ACF field
              for (const [fieldName, fieldValue] of Object.entries(acfData.fields)) {
                if (fieldValue === null || fieldValue === undefined || fieldValue === '') {
                  continue;
                }

                const valueStr = serializeAcfValue(fieldValue);
                if (!valueStr) continue;

                // Find field definition
                const fieldDef = fieldDefinitions.find((f) => f.name === fieldName);
                
                const key = fieldName;
                if (!fieldValueMap.has(key)) {
                  fieldValueMap.set(key, {
                    fieldName,
                    fieldLabel: fieldDef?.label || fieldName.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()),
                    fieldType: fieldDef?.type || 'text',
                    values: new Set(),
                    posts: [],
                  });
                }

                const fieldInfo = fieldValueMap.get(key)!;
                fieldInfo.values.add(valueStr);
                
                // Add post if not already present
                const postExists = fieldInfo.posts.some(p => p.postId === post.id);
                if (!postExists) {
                  fieldInfo.posts.push({
                    postId: post.id,
                    postType,
                    postTitle: post.title || 'Untitled',
                    postLink: post.link || '',
                  });
                }

                // Add to all fields array (value serialized for display)
                allACFFields.push({
                  fieldName,
                  fieldLabel: fieldInfo.fieldLabel,
                  fieldType: fieldInfo.fieldType,
                  value: valueStr,
                  postId: post.id,
                  postType,
                  postTitle: post.title || 'Untitled',
                  postLink: post.link || '',
                });
              }
            }
          }
        }

        if (posts.length < 100) {
          hasMore = false;
        } else {
          page++;
        }
      }
    }

    // Convert field map to field groups
    const fieldGroups = Array.from(fieldValueMap.values()).map(fieldInfo => ({
      name: fieldInfo.fieldName,
      label: fieldInfo.fieldLabel,
      type: fieldInfo.fieldType,
      occurrenceCount: fieldInfo.posts.length,
      sampleValue: Array.from(fieldInfo.values)[0],
    }));

    onProgress?.('ACF scan complete!', 100);

    return {
      success: true,
      fields: allACFFields,
      fieldGroups,
    };
  } catch (error) {
    return {
      success: false,
      fields: [],
      fieldGroups: [],
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
