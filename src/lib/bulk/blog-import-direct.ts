import mammoth from "mammoth";
import type { CSVRow, WordPressPostDestination } from "@/lib/bulk-auto-generate";
import type { BulkProcessingOptions } from "@/lib/bulk-auto-generate";
import { buildSitesToPostFromPosting } from "@/lib/bulk-auto-generate";
import { BulkFileManager, type BulkGeneratedFile } from "@/lib/bulk-file-manager";
import type { BlogImportFormState } from "@/lib/bulk/blog-import-parse";
import { isBlogImportFileAccepted } from "@/lib/bulk/blog-import-parser";
import { extractDirectImportMetaViaOpenRouter } from "@/lib/bulk/blog-import-openrouter-run";
import { reformatExistingMarkdownHeadings } from "@/lib/bulk/blog-import-format-blocks";
import {
  directPageUrl,
  generateDirectFeaturedImagePayload,
  resolveDirectFeaturedImageMode,
  uploadDirectFeaturedMedia,
  writeDirectImportMetaOnly,
  type DirectAnalyzeKeywordFn,
} from "@/lib/bulk/blog-import-direct-extras";
import { serializeModifierLinksJson } from "@/lib/bulk/bulk-csv-parser";
import {
  collectImportedDraftLinksFromSource,
  importedDraftLinkUrls,
} from "@/lib/bulk/blog-import-draft-links";
import { markdownToHtml, generateExcerpt } from "@/lib/markdown-to-html";
import { createWordPressPost } from "@/lib/wordpress-api";
import { resolveEntityEndpointForRow } from "@/lib/competitor-research/competitor-entity-sitemap";
import { acfCompetitorAppliesForRow } from "@/lib/acf-competitor-applies";
import { loadApiKey } from "@/lib/api";
import {
  formatWordPressDate,
  resolveBulkWordPressPublishDate,
  resolveWordPressPostStatusForSchedule,
} from "@/lib/wordpress-scheduler";

export function rowHasDirectImportSource(row: Pick<CSVRow, "imported_html" | "imported_markdown">): boolean {
  return Boolean(row.imported_html?.trim() || row.imported_markdown?.trim());
}

export function fileFromStoredImportRow(row: CSVRow): File | null {
  const name = row.import_file_name?.trim() || "import.md";
  if (row.imported_markdown?.trim()) {
    return new File([row.imported_markdown], name, { type: "text/markdown" });
  }
  if (row.imported_html?.trim()) {
    const htmlName = /\.html?$/i.test(name) ? name : `${name.replace(/\.[^.]+$/, "")}.html`;
    return new File([row.imported_html], htmlName, { type: "text/html" });
  }
  return null;
}

export function formatDirectImportHtml(row: Pick<CSVRow, "imported_html" | "imported_markdown">): string {
  const html = row.imported_html?.trim();
  if (html) return html;
  const markdown = row.imported_markdown?.trim();
  if (markdown) return markdownToHtml(reformatExistingMarkdownHeadings(markdown));
  throw new Error("Import row has no HTML or markdown to publish");
}

export function buildDirectAcfFields(row: CSVRow, excerpt: string): Record<string, string> {
  const title = row.title.trim();
  const keyword = (row.keyword_focus || row.keyword).trim();
  if (!title || !keyword) {
    throw new Error("Direct import meta is missing title or keyword");
  }
  const fields: Record<string, string> = {
    keyword_focus: keyword,
    seo_title: title,
    meta_description: (row.meta_description?.trim() || excerpt).slice(0, 500),
  };
  if (row.date_modifier?.trim()) fields.date_modifier = row.date_modifier.trim();
  if (acfCompetitorAppliesForRow(row.keyword)) {
    if (row.competitor?.trim()) fields.competitor = row.competitor.trim();
    if (row.competitor_fields?.trim()) fields.competitor_fields = row.competitor_fields.trim();
  } else if (row.origin?.trim() && row.origin.trim() !== "N/A") {
    fields.origin = row.origin.trim();
  }
  return fields;
}

function excerptFromDirectSource(row: CSVRow, html: string): string {
  if (row.meta_description?.trim()) return row.meta_description.trim();
  const markdown = row.imported_markdown?.trim();
  if (markdown) return generateExcerpt(markdown);
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return generateExcerpt(text);
}

export async function readDirectImportSource(
  file: File,
): Promise<{ html?: string; markdown?: string }> {
  if (!isBlogImportFileAccepted(file)) {
    throw new Error(`Unsupported file type. Use ${file.name} as .docx, .md, .html, or .txt`);
  }
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";

  if (ext === "docx") {
    const result = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
    const html = result.value?.trim() ?? "";
    if (!html) throw new Error(`${file.name} is empty`);
    return { html };
  }
  if (ext === "html" || ext === "htm") {
    const html = (await file.text()).trim();
    if (!html) throw new Error(`${file.name} is empty`);
    return { html };
  }
  const markdown = (await file.text()).replace(/\r\n/g, "\n").trim();
  if (!markdown) throw new Error(`${file.name} is empty`);
  return { markdown };
}

function importRowLinkFields(html?: string, markdown?: string): Pick<CSVRow, "imported_links_json" | "modifier_links_json"> {
  const links = collectImportedDraftLinksFromSource({ html, markdown });
  const urls = importedDraftLinkUrls(links);
  if (urls.length === 0) return {};
  return {
    imported_links_json: JSON.stringify(links),
    modifier_links_json: serializeModifierLinksJson(urls),
  };
}

export async function buildImportCsvRowFromFile(
  file: File,
  form: BlogImportFormState,
  destination: WordPressPostDestination,
  openRouterApiKey: string,
  model?: string,
): Promise<CSVRow> {
  const source = await readDirectImportSource(file);
  const meta = await extractDirectImportMetaViaOpenRouter(file, form, openRouterApiKey, model);
  const html = source.html;
  const markdown = source.markdown;
  const linkFields = importRowLinkFields(html, markdown);

  return {
    keyword: meta.keyword,
    keyword_focus: meta.keyword,
    title: meta.title,
    meta_description: meta.meta_description,
    featuredImage: form.featuredImageMode,
    imported_html: html,
    imported_markdown: markdown,
    import_file_name: file.name,
    post_destination: destination,
    target_slug: meta.slug,
    ...(form.entity.trim() ? { entity: form.entity.trim() } : {}),
    ...linkFields,
  };
}

export async function processDirectBlogImportRow(args: {
  rowIndex: number;
  row: CSVRow;
  options: BulkProcessingOptions;
  fileManager: BulkFileManager;
  analyzeKeyword: DirectAnalyzeKeywordFn;
}): Promise<BulkGeneratedFile[]> {
  const { rowIndex, row, options, fileManager } = args;
  const apiKey = (options.openRouterApiKey || loadApiKey()).trim();
  if (!apiKey) {
    throw new Error("OpenRouter API key is required for Direct import meta");
  }
  const sourceFile = fileFromStoredImportRow(row);
  if (!sourceFile) {
    throw new Error("Direct import row has no stored file");
  }
  const featuredImageMode = resolveDirectFeaturedImageMode(row, options.blogImportForm?.featuredImageMode);
  const form: BlogImportFormState = options.blogImportForm ?? {
    focusKeyword: row.keyword ?? "",
    titleOverride: "",
    featuredImageMode,
    entity: row.entity ?? "",
  };
  options.onProgress?.(rowIndex, 0, "OpenRouter meta...");
  const meta = await extractDirectImportMetaViaOpenRouter(
    sourceFile,
    form,
    apiKey,
    options.selectedModel,
  );
  const publishRow: CSVRow = {
    ...row,
    title: meta.title,
    keyword: meta.keyword,
    keyword_focus: meta.keyword,
    meta_description: meta.meta_description,
    target_slug: meta.slug,
    featuredImage: featuredImageMode,
  };

  options.onProgress?.(rowIndex, 0, "Preparing body...");
  const formattedHtml = formatDirectImportHtml(publishRow);
  const excerpt = excerptFromDirectSource(publishRow, formattedHtml);
  const title = publishRow.title.trim();
  const slug = publishRow.target_slug!.trim();
  const keyword = (publishRow.keyword_focus || publishRow.keyword).trim();

  const posting = options.wordPressPosting;
  const sitesToPost = posting?.enabled ? buildSitesToPostFromPosting(posting) : [];

  const generatedFiles: BulkGeneratedFile[] = [];
  const html = formattedHtml;
  const acfFields = buildDirectAcfFields(publishRow, excerpt);

  let featuredImage: { imageBase64: string; filename: string } | undefined;
  if (featuredImageMode !== "n" && sitesToPost.length > 0) {
    options.onProgress?.(rowIndex, 0, "Featured image...");
    featuredImage = await generateDirectFeaturedImagePayload({
      mode: featuredImageMode,
      title,
      bodyHtml: formattedHtml,
      entity: publishRow.entity,
      apiKey,
      model: options.selectedModel,
    });
  }

  const timestamp = Date.now();
  const contentFile: BulkGeneratedFile = {
    id: BulkFileManager.createFileId(rowIndex, "content", timestamp),
    rowIndex,
    fileName: BulkFileManager.generateFileName(publishRow, "content", timestamp),
    content: html,
    mimeType: "text/html",
    status: "completed",
    timestamp,
    rowData: publishRow,
  };
  fileManager.addFile(contentFile);
  generatedFiles.push(contentFile);

  if (sitesToPost.length === 0) {
    options.onProgress?.(rowIndex, 0, "Meta JSON...");
    const timestampLocal = timestamp;
    const metaFile: BulkGeneratedFile = {
      id: BulkFileManager.createFileId(rowIndex, "blog-import-meta", timestampLocal),
      rowIndex,
      fileName: `blog-import-meta-${title.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase()}-${timestampLocal}.json`,
      content: JSON.stringify(
        {
          title,
          slug,
          keyword,
          excerpt,
          meta_description: publishRow.meta_description,
          acfFields,
          html,
        },
        null,
        2,
      ),
      mimeType: "application/json",
      status: "completed",
      timestamp: timestampLocal,
      rowData: publishRow,
    };
    fileManager.addFile(metaFile);
    generatedFiles.push(metaFile);
    return generatedFiles;
  }

  const firstSite = sitesToPost[0]!.site;
  const pageUrl = directPageUrl(firstSite, slug);

  const wpPosting = posting!;
  const scheduleOpts = {
    frequency: wpPosting.frequency,
    customInterval: wpPosting.customInterval,
    customStaggerOptimized: wpPosting.customStaggerOptimized,
    dayOfWeek: wpPosting.dayOfWeek,
    startDate: wpPosting.startDate,
    startTime: wpPosting.startTime,
    totalRows: wpPosting.totalRows,
    useGapScheduling: wpPosting.useGapScheduling,
    scheduleOccupancy: wpPosting.scheduleOccupancy,
    publishDays: wpPosting.publishDays,
  };
  const scheduleSlotIndex = options.bulkScheduleSlotIndex ?? rowIndex;
  const { date: scheduledDate } = resolveBulkWordPressPublishDate({
    rowPublishDateGmt: row.publish_date_gmt,
    rowIndex: scheduleSlotIndex,
    schedule: scheduleOpts,
    useCsvPublishDates: wpPosting.useCsvPublishDates !== false,
  });
  const wpPostStatus = wpPosting.draftOnly
    ? ("draft" as const)
    : resolveWordPressPostStatusForSchedule(scheduledDate);

  for (let siteIndex = 0; siteIndex < sitesToPost.length; siteIndex++) {
    const { site, sitemapType } = sitesToPost[siteIndex]!;
    options.onProgress?.(rowIndex, 0, `Direct upload to ${site.name}...`);
    const entityEndpoint =
      sitemapType === "entity"
        ? resolveEntityEndpointForRow(site, row, sitemapType)
        : "posts";
    const postTypeForAcf = sitemapType === "entity" ? entityEndpoint : "post";
    const featuredImageId = featuredImage
      ? (
          await uploadDirectFeaturedMedia({
            site,
            imageBase64: featuredImage.imageBase64,
            filename: featuredImage.filename,
            title,
            keyword,
          })
        ).mediaId
      : undefined;
    const postResult = await createWordPressPost(
      site.siteUrl,
      site.username,
      site.appPassword,
      title,
      html,
      excerpt,
      wpPostStatus,
      wpPosting.draftOnly ? undefined : formatWordPressDate(scheduledDate),
      featuredImageId,
      undefined,
      undefined,
      undefined,
      entityEndpoint,
      slug,
    );
    if (!postResult.success || !postResult.postId) {
      throw new Error(postResult.error || `WordPress create failed on ${site.name}`);
    }
    const postLink =
      (typeof postResult.link === "string" && postResult.link.trim()) ||
      `${directPageUrl(site, slug)}`;
    const writtenAcf = await writeDirectImportMetaOnly({
      site,
      postId: postResult.postId,
      postTypeForAcf,
      entityEndpoint,
      postLink,
      postTitle: title,
      excerpt,
      primaryKw: keyword,
      baseAcf: acfFields,
      apiKey,
    });
    const siteNameSlug = site.name.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase();
    const wpFile: BulkGeneratedFile = {
      id: BulkFileManager.createFileId(rowIndex, `wordpress-post-${siteIndex}`, timestamp),
      rowIndex,
      fileName: `wordpress-post-${siteNameSlug}-${title.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase()}-${timestamp}.json`,
      content: JSON.stringify(
        {
          postId: postResult.postId,
          title,
          link: postResult.link,
          status: postResult.status,
          excerpt,
          acfFields: writtenAcf,
          featuredImageId: featuredImageId ?? null,
          endpoint: entityEndpoint,
          sitemapType,
        },
        null,
        2,
      ),
      mimeType: "application/json",
      status: "completed",
      timestamp,
      rowData: publishRow,
    };
    fileManager.addFile(wpFile);
    generatedFiles.push(wpFile);
  }

  return generatedFiles;
}
