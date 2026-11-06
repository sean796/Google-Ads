/**
 * Conflict Checking Module
 * Checks for conflicts with existing entities and scheduled posts
 */

import { getScheduledPosts } from "@/lib/wordpress-api";
import { notify } from "@/lib/app-notifications";
import { NOTIFY_CHECKING_SCHEDULED_POSTS_FOR_CONFLICTS } from "@/lib/notify-messages";
import { logger } from "@/lib/logger";
import type { WordPressSite } from "../../types";

export interface ConflictCheckResult {
  nonConflictingEntities: string[];
  conflictStats: {
    filteredCount: number;
    conflictWithExistingCount: number;
    conflictWithPostsCount: number;
  };
}

/**
 * Fetches scheduled post titles for conflict checking
 */
export async function fetchScheduledPostTitles(
  site: WordPressSite
): Promise<string[]> {
  try {
    notify.info(NOTIFY_CHECKING_SCHEDULED_POSTS_FOR_CONFLICTS);
    const scheduledResult = await getScheduledPosts(
      site.siteUrl,
      site.username,
      site.appPassword,
      undefined,
      undefined,
      true // Get all scheduled posts
    );
    if (scheduledResult.posts && scheduledResult.posts.length > 0) {
      const titles = scheduledResult.posts.map(post => post.title?.toLowerCase() || '');
      return titles;
    }
  } catch (error) {
    logger.warn('[Entity Generation] Could not fetch scheduled posts for conflict checking:', error);
  }
  return [];
}

/**
 * Checks if an entity conflicts with scheduled post titles
 */
function conflictsWithScheduledPost(
  entity: string,
  scheduledPostTitles: string[]
): boolean {
  if (scheduledPostTitles.length === 0) {
    return false;
  }
  
  const entityLower = entity.toLowerCase().trim();
  
  return scheduledPostTitles.some(postTitle => {
    const afterNear = postTitle.split(' near ')[1]?.trim() || '';
    const afterIn = postTitle.split(' in ')[1]?.trim() || '';
    const locationInPost = (afterNear || afterIn).toLowerCase();
    
    // Only exact match
    return locationInPost && entityLower === locationInPost;
  });
}

/** Normalize for comparison: lowercase, trim, collapse spaces */
export function normalizeEntityForConflict(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Returns true if entity should be excluded because it matches an existing entity.
 * Uses exact match AND prefix/substring match so that e.g. existing "Garden City"
 * (from sitemap or Origin ACF) conflicts with candidate "Garden City, Winnipeg".
 * Export for use in extract-candidates and other callers.
 */
export function entityConflictsWithExisting(
  entity: string,
  existingEntities: string[]
): boolean {
  if (existingEntities.length === 0) return false;
  const entityNorm = normalizeEntityForConflict(entity);
  if (!entityNorm) return false;
  return existingEntities.some((existing) => {
    const existingNorm = normalizeEntityForConflict(existing);
    if (!existingNorm) return false;
    if (entityNorm === existingNorm) return true;
    if (entityNorm.startsWith(existingNorm + ',') || entityNorm.startsWith(existingNorm + ' ')) return true;
    if (existingNorm.startsWith(entityNorm + ',') || existingNorm.startsWith(entityNorm + ' ')) return true;
    return false;
  });
}

/**
 * Checks if an entity conflicts with existing entities (internal wrapper).
 */
function conflictsWithExisting(
  entity: string,
  existingEntities: string[]
): boolean {
  return entityConflictsWithExisting(entity, existingEntities);
}

/**
 * Filters out entities that conflict with existing entities or scheduled posts
 */
export function checkConflicts(
  entities: string[],
  existingEntities: string[],
  scheduledPostTitles: string[]
): ConflictCheckResult {
  const existingLower = existingEntities.map(e => e.toLowerCase().trim());
  
  let filteredCount = 0;
  let conflictWithExistingCount = 0;
  let conflictWithPostsCount = 0;
  
  const nonConflictingEntities = entities.filter(entity => {
    if (!entity || entity.length < 2) {
      filteredCount++;
      return false;
    }
    
    // Check for exact matches with existing entities
    if (conflictsWithExisting(entity, existingEntities)) {
      conflictWithExistingCount++;
      return false;
    }
    
    // Check if it conflicts with scheduled post titles
    if (conflictsWithScheduledPost(entity, scheduledPostTitles)) {
      conflictWithPostsCount++;
      return false;
    }
    
    return true;
  });
  
  
  return {
    nonConflictingEntities,
    conflictStats: {
      filteredCount,
      conflictWithExistingCount,
      conflictWithPostsCount
    }
  };
}
