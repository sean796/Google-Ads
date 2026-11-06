/**
 * File manager for optimization files
 * Stores and manages files generated during content optimization process
 */
import { logger } from "@/lib/logger";

export interface OptimizationFile {
  name: string;
  content: string;
  mimeType: string;
}

export class OptimizationFileManager {
  private files: OptimizationFile[] = [];

  /**
   * Add a file to the manager
   */
  addFile(name: string, content: string, mimeType: string): void {
    this.files.push({
      name,
      content,
      mimeType,
    });
  }

  /**
   * Get all files
   */
  getFiles(): OptimizationFile[] {
    return [...this.files];
  }

  /**
   * Get file count
   */
  getFileCount(): number {
    return this.files.length;
  }

  /**
   * Replace content-*.html and content-*.md artifacts with post-processed HTML (e.g. after internal links).
   */
  syncContentArtifactHtml(html: string, markdown: string): boolean {
    let updated = false;
    for (let i = 0; i < this.files.length; i++) {
      const name = this.files[i].name.toLowerCase();
      if (name.startsWith("content-") && name.endsWith(".html")) {
        this.files[i] = { ...this.files[i], content: html };
        updated = true;
      } else if (name.startsWith("content-") && name.endsWith(".md")) {
        this.files[i] = { ...this.files[i], content: markdown };
        updated = true;
      }
    }
    return updated;
  }

  /**
   * Download a single file
   */
  downloadFile(file: OptimizationFile): void {
    try {
      let blob: Blob;
      
      if (file.mimeType.startsWith('image/')) {
        // Handle image files - content should be base64 or URL
        if (file.content.startsWith('data:')) {
          // Base64 data URL - extract base64 string and convert to blob
          try {
// Extract the base64 part (everything after the comma)
            const commaIndex = file.content.indexOf(',');
            let base64String: string;
            if (commaIndex !== -1) {
              base64String = file.content.substring(commaIndex + 1);
            } else {
              // No comma found - might be malformed, try to extract base64 after the semicolon
              const semicolonIndex = file.content.indexOf(';');
              if (semicolonIndex !== -1) {
                base64String = file.content.substring(semicolonIndex + 1).replace(/^base64,?/i, '');
              } else {
                base64String = file.content;
              }
            }
            // Clean the base64 string (remove whitespace, newlines)
            base64String = base64String.trim().replace(/\s/g, '');
const byteCharacters = atob(base64String);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
              byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            blob = new Blob([byteArray], { type: file.mimeType });
          } catch (err) {
logger.error('Error processing data URL image:', err);
            alert(`Failed to download ${file.name}. Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
            return;
          }
        } else {
          // Assume base64 string without data URL prefix
          try {
            // Clean the base64 string (remove whitespace, newlines)
            const cleanBase64 = file.content.trim().replace(/\s/g, '');
            const byteCharacters = atob(cleanBase64);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
              byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            blob = new Blob([byteArray], { type: file.mimeType });
          } catch (err) {
            logger.error('Error processing base64 image:', err);
            alert(`Failed to download ${file.name}. Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
            return;
          }
        }
      } else {
        // Text files (JSON, TXT, MD, HTML)
        blob = new Blob([file.content], { type: file.mimeType });
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = file.name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      logger.error('Error downloading file:', error);
      alert(`Failed to download ${file.name}. Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Download all files sequentially
   */
  downloadAllFiles(): void {
    const files = this.getFiles();
    if (files.length === 0) {
      alert('No files to download');
      return;
    }

    files.forEach((file, index) => {
      // Add delay between downloads to prevent browser blocking
      setTimeout(() => {
        this.downloadFile(file);
      }, index * 300); // 300ms delay between each file
    });
  }

  /**
   * Remove a specific file by name
   */
  removeFile(name: string): void {
    this.files = this.files.filter(f => f.name !== name);
  }

  /**
   * Clear all files
   */
  clear(): void {
    this.files = [];
  }

  /**
   * Sanitize filename
   */
  static sanitizeFilename(filename: string): string {
    return filename
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 100); // Limit length
  }

  /**
   * Generate filename with keyword and timestamp
   */
  static generateFilename(type: string, keyword: string, extension: string): string {
    const sanitizedKeyword = this.sanitizeFilename(keyword);
    const timestamp = Date.now();
    return `${type}-${sanitizedKeyword}-${timestamp}.${extension}`;
  }
}

