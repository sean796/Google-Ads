import { useState, useRef } from "react";
import { KB_FILES_STORAGE_KEY, type StoredFile, type WordPressSite } from "../types";
import { notify, notifyHeaderError } from "@/lib/app-notifications";
import { NOTIFY_ADD_GA4_PROPERTY_ID_FOR_THIS_SITE_CLICK_, NOTIFY_ENTITY_POST_CREATED_DATE_MODIFIER, NOTIFY_GMB_STATS_ADDED_TO_KNOWLEDGE_BASE, NOTIFY_NO_GMB_PERFORMANCE_DATA_RETURNED, NOTIFY_POST_CREATED_NO_DATE_MODIFIER, notifyAcfRestFailedX, notifyEntityPostFailedX, notifyGmbStatsSavedButApiReportedXUseL } from "@/lib/notify-messages";
import { extractEndpointFromEntitySitemapUrl } from "@/lib/entity-endpoint-extractor";
import { BACKEND_API_BASE } from "@/lib/wordpress-api/connection";
import { neoPulseApiHeaders } from "@/lib/neo-pulse-api-headers";
import { getGMBPullDateRanges } from "@/lib/gmb-date-helpers";
import { loadApiKey } from "@/lib/api";
import { resolveRecommendedAuthor } from "@/lib/wordpress-api/author-resolver";
import { normalizeGa4PropertyIdForApi, resolveGa4PropertyIdForReporting } from "@/lib/ga4-property-id";
import { logger } from "@/lib/logger";
import type { NeoFieldsTestResult } from "./wordpress-card-actions-types";

export function useWordPressCardActions(site: WordPressSite) {
  const [isTestingNeoFields, setIsTestingNeoFields] = useState(false);
  const [isTestingGA, setIsTestingGA] = useState(false);
  const [isTestingGMB, setIsTestingGMB] = useState(false);
  const [isPullingGMBStats, setIsPullingGMBStats] = useState(false);
  const pullGMBInProgressRef = useRef(false);
  const [neoFieldsTestResult, setNeoFieldsTestResult] = useState<NeoFieldsTestResult & { dateModifierSet?: boolean; postId?: number; postUrl?: string } | null>(null);

  const handlePullGMBStats = async () => {
    if (pullGMBInProgressRef.current) return;
    pullGMBInProgressRef.current = true;
    const dates = getGMBPullDateRanges(); // current period end capped at today-3d for API data lag
    const body = { ...dates } as Record<string, unknown>;
    if (site.gbpLocationId?.trim()) {
      body.locationIds = [site.gbpLocationId.trim()];
    }
    setIsPullingGMBStats(true);
    try {
      const response = await fetch(`${BACKEND_API_BASE}/api/gmb/performance`, {
        method: "POST",
        credentials: "include",
        headers: neoPulseApiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        notify.error(data?.error ?? response.statusText ?? "Failed to pull GMB stats");
        return;
      }
      if (!data.success || !data.currentPeriod) {
        notify.error(NOTIFY_NO_GMB_PERFORMANCE_DATA_RETURNED);
        return;
      }
      const cur = data.currentPeriod;
      const comp = data.comparisonPeriod;
      const apiWarning = data.apiWarning;
      const curTotal = (cur.calls ?? 0) + (cur.directions ?? 0) + (cur.websiteClicks ?? 0);
      const compTotal = (comp?.calls ?? 0) + (comp?.directions ?? 0) + (comp?.websiteClicks ?? 0);
      const allZero = curTotal === 0 && compTotal === 0;
      let footnote = "";
      if (apiWarning) footnote += `\n\n**API note:** ${apiWarning}\n`;
      if (allZero && !apiWarning) footnote += "\n\n*All metrics are 0 for these periods (no recorded activity in GBP for these dates, or data not yet available).*\n";
      const content = `# Google Business Profile – Performance snapshot
Pulled: ${new Date().toISOString().slice(0, 19)}Z | Locations: ${data.locationCount ?? 0}

## Current period (${cur.startDate} – ${cur.endDate})
| Metric | Count |
| --- | --- |
| Call clicks | ${cur.calls?.toLocaleString() ?? 0} |
| Direction requests | ${cur.directions?.toLocaleString() ?? 0} |
| Website clicks | ${cur.websiteClicks?.toLocaleString() ?? 0} |

## Comparison period (${comp?.startDate} – ${comp?.endDate})
| Metric | Count |
| --- | --- |
| Call clicks | ${comp?.calls?.toLocaleString() ?? 0} |
| Direction requests | ${comp?.directions?.toLocaleString() ?? 0} |
| Website clicks | ${comp?.websiteClicks?.toLocaleString() ?? 0} |
${footnote}`;
      const timestamp = Date.now();
      const newFile: StoredFile = {
        name: `gmb-stats-${timestamp}.md`,
        size: content.length,
        content,
        starred: false,
        timestamp,
      };
      const stored = localStorage.getItem(KB_FILES_STORAGE_KEY) || "[]";
      const files: StoredFile[] = JSON.parse(stored);
      localStorage.setItem(KB_FILES_STORAGE_KEY, JSON.stringify([...files, newFile]));
      window.dispatchEvent(new CustomEvent("kb-files-updated", { detail: { files: [...files, newFile] } }));
      if (apiWarning) notify.warning(notifyGmbStatsSavedButApiReportedXUseL(apiWarning));
      else notify.success(NOTIFY_GMB_STATS_ADDED_TO_KNOWLEDGE_BASE);
    } catch (err) {
      notifyHeaderError("GMB stats pull failed", err);
    } finally {
      pullGMBInProgressRef.current = false;
      setIsPullingGMBStats(false);
    }
  };

  const handleTestGMB = async () => {
    setIsTestingGMB(true);
    try {
      const response = await fetch(`${BACKEND_API_BASE}/api/gmb/test`, {
        method: "POST",
        credentials: "include",
        headers: neoPulseApiHeaders({ "Content-Type": "application/json" }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.success) {
        notify.success(data.message || "Google Business Profile connection OK");
      } else {
        notify.error(data.error || response.statusText || "GMB test failed");
      }
    } catch (err) {
      notifyHeaderError("GMB test failed", err);
    } finally {
      setIsTestingGMB(false);
    }
  };

  const handleTestGA = async () => {
    let propertyId = "";
    try {
      const raw = resolveGa4PropertyIdForReporting(site);
      propertyId = raw ? normalizeGa4PropertyIdForApi(raw) : "";
    } catch (err) {
      notify.error(err instanceof Error ? err.message : "Invalid GA4 Property ID.");
      return;
    }
    if (!propertyId) {
      notify.error(NOTIFY_ADD_GA4_PROPERTY_ID_FOR_THIS_SITE_CLICK_);
      return;
    }
    setIsTestingGA(true);
    try {
      const response = await fetch(`${BACKEND_API_BASE}/api/ga/test`, {
        method: "POST",
        headers: neoPulseApiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ propertyId }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.success) {
        notify.success(data.message || "Google Analytics connection OK");
      } else {
        notify.error(data.error || response.statusText || "Google Analytics test failed");
      }
    } catch (err) {
      notifyHeaderError("Google Analytics test failed", err);
    } finally {
      setIsTestingGA(false);
    }
  };

  const handleTestNeoFields = async () => {
    setIsTestingNeoFields(true);
    setNeoFieldsTestResult(null);
    
    try {
      // Use entity sitemap URL to determine the correct endpoint
      let testPostType = 'post';
      let testEndpoint = 'posts';
      
      // Priority: Use entitySitemapUrl if available (this is the entity/CPT endpoint)
      if (site.entitySitemapUrl) {
        testEndpoint = extractEndpointFromEntitySitemapUrl(site.entitySitemapUrl);
        testPostType = testEndpoint; // For CPTs, type and endpoint are usually the same
      }
      
      // CREATE A NEW POST with date_modifier set to today
      let dateModifierSet = false;
      let newPostId: number | undefined;
      let postUrl: string | undefined;
      let createError: string | undefined;
      const today = new Date().toISOString().split('T')[0]; // "2026-01-19"
      

      let authorId: number | undefined;
      try {
        authorId = await resolveRecommendedAuthor({
          site,
          postTypeEndpoint: testEndpoint,
          apiKey: loadApiKey(),
          siteId: site.id,
        });
      } catch {
        authorId = undefined;
      }
      
      try {
        const requestBody: Record<string, unknown> = {
          siteUrl: site.siteUrl,
          username: site.username,
          appPassword: site.appPassword,
          title: `NEO Test - ${today}`,
          content: `<p>Test post created to verify NEO Fields REST API. Date modifier: ${today}</p>`,
          status: 'draft',
          postType: testPostType,
          postTypeEndpoint: testEndpoint
        };
        if (authorId != null) requestBody.author = authorId;
        
        // Create a new post in the entity CPT
        const createResponse = await fetch(`${BACKEND_API_BASE}/api/wordpress/create-post`, {
          method: 'POST',
          headers: neoPulseApiHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify(requestBody)
        });

        const createText = await createResponse.text();
        let createData: { success?: boolean; postId?: number; id?: number; link?: string; url?: string; error?: string };
        try {
          createData = createText ? JSON.parse(createText) : {};
        } catch {
          throw new Error(
            `Server returned invalid JSON. Status: ${createResponse.status}. ` +
            `Ensure VITE_MCP_API_BASE points to your backend on Render. Body: ${createText.slice(0, 150) || "empty"}`
          );
        }
        
        
        if (createData.success && (createData.postId || createData.id)) {
          newPostId = createData.postId || createData.id;
          postUrl = createData.link || createData.url;
          
          // Now set the date_modifier field on the new post
          const updateResponse = await fetch(`${BACKEND_API_BASE}/api/wordpress/update-acf-fields`, {
            method: 'POST',
            headers: neoPulseApiHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({
              siteUrl: site.siteUrl,
              username: site.username,
              appPassword: site.appPassword,
              postId: newPostId,
              postType: testPostType,
              postTypeEndpoint: testEndpoint,
              fields: {
                date_modifier: today
              },
              options: {
                verifyAfterUpdate: true
              }
            })
          });

          const updateText = await updateResponse.text();
          let updateData: { success?: boolean; error?: string; updated?: unknown; failed?: unknown };
          try {
            updateData = updateText ? JSON.parse(updateText) : {};
          } catch {
            throw new Error(
              `NEO Fields update returned invalid JSON. Status: ${updateResponse.status}. ` +
              `Body: ${updateText.slice(0, 150) || "empty"}`
            );
          }
          
          dateModifierSet = updateData.success;
          
          if (dateModifierSet) {
            /* date_modifier set, no warning needed */
          } else {
            logger.warn('[NEO Fields Test] Post created but failed to set date_modifier:', updateData.error || updateData.failed);
          }
        } else {
          createError = createData.error || 'Failed to create post';
          logger.error('[NEO Fields Test] Failed to create test post:', createError);
        }
      } catch (err) {
        createError = err instanceof Error ? err.message : 'Unknown error';
        logger.error('[NEO Fields Test] Error creating test post:', err);
      }
      
      const success = !!newPostId;
      
      setNeoFieldsTestResult({
        success,
        hasNeoFieldsSupport: success,
        dateModifierSet,
        postId: newPostId,
        postUrl,
        error: createError
      });
      
      if (success) {
        if (dateModifierSet && newPostId) {
          notify.success(NOTIFY_ENTITY_POST_CREATED_DATE_MODIFIER);
        } else if (newPostId) {
          logger.warn("[NEO Fields Test] date_modifier not set", newPostId);
          notify.warning(NOTIFY_POST_CREATED_NO_DATE_MODIFIER);
        }
      } else {
        const errShort =
          (createError && createError.length > 90)
            ? `${createError.slice(0, 87)}...`
            : createError || "Create failed";
        notify.error(notifyEntityPostFailedX(errShort));
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      setNeoFieldsTestResult({
        success: false,
        error: errorMsg
      });
      const short =
        errorMsg.length > 100 ? `${errorMsg.slice(0, 97)}...` : errorMsg;
      notify.error(`NEO Fields failed: ${short}`);
    } finally {
      setIsTestingNeoFields(false);
    }
  };

  return {
    isTestingNeoFields,
    isTestingGA,
    isTestingGMB,
    isPullingGMBStats,
    neoFieldsTestResult,
    handlePullGMBStats,
    handleTestGMB,
    handleTestGA,
    handleTestNeoFields,
  };
}
