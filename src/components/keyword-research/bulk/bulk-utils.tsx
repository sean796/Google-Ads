import { FileText, FileJson, FileSpreadsheet, Image as ImageIcon, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import type { BulkGeneratedFile } from '@/lib/bulk-file-manager';
import { logger } from "@/lib/logger";
import type { GSCQuery, AnalysisResult } from '@/lib/gsc-keyword-analyzer';

/**
 * Get icon component for a file based on its extension
 */
export const getFileIcon = (fileName: string) => {
  if (fileName.endsWith('.json')) return <FileJson className="h-4 w-4" />;
  if (fileName.endsWith('.csv')) return <FileSpreadsheet className="h-4 w-4" />;
  if (fileName.endsWith('.md')) return <FileText className="h-4 w-4" />;
  if (fileName.endsWith('.png') || fileName.endsWith('.jpg') || fileName.endsWith('.jpeg') || fileName.endsWith('.webp')) return <ImageIcon className="h-4 w-4" />;
  return <FileText className="h-4 w-4" />;
};

/**
 * Check if file is an image with base64 content that can be previewed
 */
export const isImageWithPreview = (file: BulkGeneratedFile): boolean => {
  // Check by file extension as primary method (more reliable)
  const isImageFile = file.fileName.endsWith('.png') || 
                     file.fileName.endsWith('.jpg') || 
                     file.fileName.endsWith('.jpeg') || 
                     file.fileName.endsWith('.webp') ||
                     file.fileName.endsWith('.gif');
  
  // Must be an image mime type OR have image file extension
  const hasImageMimeType = file.mimeType && file.mimeType.startsWith('image/');
  if (!hasImageMimeType && !isImageFile) {
    return false;
  }
  
  // Must have content
  if (!file.content || typeof file.content !== 'string' || file.content.length === 0) {
    logger.warn('ImageThumbnail: No content for image file', file.fileName);
    return false;
  }
  
  // Must be completed
  if (file.status !== 'completed') {
    return false;
  }
  
  // Content should be a data URL or valid base64 that can be converted
  // Accept if it starts with data:image/ or if it's base64 (long string without spaces/newlines)
  const isDataUrl = file.content.startsWith('data:image/');
  const looksLikeBase64 = file.content.length > 100 && !file.content.includes('\n') && !file.content.includes(' ');
  
  const canPreview = isDataUrl || looksLikeBase64;
  
  if (!canPreview && isImageFile) {
    logger.warn('ImageThumbnail: Image file detected but content format invalid', {
      fileName: file.fileName,
      mimeType: file.mimeType,
      contentLength: file.content.length,
      contentStart: file.content.substring(0, 50)
    });
  }
  
  return canPreview;
};

/**
 * Get status icon component for a file
 */
export const getStatusIcon = (file: BulkGeneratedFile) => {
  switch (file.status) {
    case 'completed':
      return <CheckCircle2 className="h-4 w-4 text-primary" />;
    case 'generating':
      return null;
    case 'error':
      return <XCircle className="h-4 w-4 text-ui-danger" />;
    default:
      return <AlertCircle className="h-4 w-4 text-muted-foreground" />;
  }
};

/**
 * Convert GSC queries to CSV format
 */
export const convertQueriesToCSV = (queries: GSCQuery[], analysisResult?: AnalysisResult): string => {
  // CSV header
  const header = 'query,clicks,impressions,ctr,position,date\n';
  
  // Convert each query to CSV row
  const rows = queries.map(q => {
    // Escape quotes and wrap in quotes if contains comma, quote, or newline
    const escapedQuery = q.query.includes(',') || q.query.includes('"') || q.query.includes('\n')
      ? `"${q.query.replace(/"/g, '""')}"`
      : q.query;
    
    return `${escapedQuery},${q.clicks},${q.impressions},${q.ctr.toFixed(4)},${q.position.toFixed(2)},${q.date}`;
  });
  
  // If AI analysis, prepend insights as a comment section at the top
  if (analysisResult?.insights) {
    const insightsLines = analysisResult.insights.split('\n').map(line => `# ${line}`);
    return insightsLines.join('\n') + '\n\n' + header + rows.join('\n');
  }
  
  return header + rows.join('\n');
};
