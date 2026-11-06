import { sanitizeFileName } from './file-processing';
import { buildBulkRunContentCsv } from './bulk-run-content-csv';

export interface BulkGeneratedFile {
  id: string;
  rowIndex: number;
  fileName: string;
  content: string;
  mimeType: string;
  status: 'pending' | 'generating' | 'completed' | 'error';
  error?: string;
  timestamp: number;
  rowData: {
    keyword: string;
    entity?: string;
    title: string;
    modifier?: string;
    featuredImage?: string;
    meta_description?: string;
    origin?: string;
  };
}

export class BulkFileManager {
  private files: Map<string, BulkGeneratedFile> = new Map();
  private rowFiles: Map<number, string[]> = new Map(); // rowIndex -> fileIds[]
  /** Fired after any mutation so React can re-read getFilesByRow() / getStats(). */
  private onMutation?: () => void;

  setOnMutation(cb?: () => void): void {
    this.onMutation = cb;
  }

  private notify(): void {
    this.onMutation?.();
  }

  /**
   * Add a file to the manager
   */
  addFile(file: BulkGeneratedFile): void {
    this.files.set(file.id, file);

    if (!this.rowFiles.has(file.rowIndex)) {
      this.rowFiles.set(file.rowIndex, []);
    }
    this.rowFiles.get(file.rowIndex)!.push(file.id);
    this.notify();
  }

  /**
   * Update file status
   */
  updateFileStatus(id: string, status: BulkGeneratedFile['status'], error?: string): void {
    const file = this.files.get(id);
    if (file) {
      file.status = status;
      if (error) {
        file.error = error;
      }
      this.files.set(id, file);
      this.notify();
    }
  }

  /**
   * Get all files for a specific row
   */
  getRowFiles(rowIndex: number): BulkGeneratedFile[] {
    const fileIds = this.rowFiles.get(rowIndex) || [];
    return fileIds.map(id => this.files.get(id)!).filter(Boolean);
  }

  /**
   * Get all files
   */
  getAllFiles(): BulkGeneratedFile[] {
    return Array.from(this.files.values());
  }

  /**
   * Get files grouped by row
   */
  getFilesByRow(): Map<number, BulkGeneratedFile[]> {
    const grouped = new Map<number, BulkGeneratedFile[]>();
    for (const [rowIndex, fileIds] of this.rowFiles.entries()) {
      grouped.set(rowIndex, fileIds.map(id => this.files.get(id)!).filter(Boolean));
    }
    return grouped;
  }

  /**
   * Generate download link for a file
   */
  getDownloadLink(file: BulkGeneratedFile): string {
    // Handle image files (base64 data URLs)
    if (file.mimeType.startsWith('image/') && file.content.startsWith('data:')) {
      return file.content; // Return base64 data URL directly
    }
    
    const blob = new Blob([file.content], { type: file.mimeType });
    const url = URL.createObjectURL(blob);
    return url;
  }

  /**
   * Download a file
   */
  downloadFile(file: BulkGeneratedFile): void {
    try {
      // Handle image files (base64 data URLs)
      if (file.mimeType.startsWith('image/')) {
        let blob: Blob;
        
        // Check if content is already a data URL
        if (file.content.startsWith('data:')) {
          // Convert base64 data URL to blob
          const base64Data = file.content.split(',')[1] || file.content;
          const mimeMatch = file.content.match(/data:([^;]+);base64,/);
          const mimeType = mimeMatch ? mimeMatch[1] : file.mimeType;
          
          try {
            const byteCharacters = atob(base64Data);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
              byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            blob = new Blob([byteArray], { type: mimeType });
          } catch (e) {
            // Fallback: try fetch method
            fetch(file.content)
              .then(res => res.blob())
              .then(blob => {
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = file.fileName;
                link.style.display = 'none';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                setTimeout(() => URL.revokeObjectURL(url), 1000);
              })
              .catch(err => {
                console.error('Error downloading image:', err);
                throw err;
              });
          }
        } else {
          // Content is raw base64 string, convert to blob
          try {
            const byteCharacters = atob(file.content);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
              byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            blob = new Blob([byteArray], { type: file.mimeType });
          } catch (e) {
            console.error('Error converting base64 to blob:', e);
            throw new Error('Invalid image data format');
          }
        }
        
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = file.fileName;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        return;
      }
      
      // Handle text files (JSON, CSV, Markdown, etc.)
      const blob = new Blob([file.content], { type: file.mimeType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = file.fileName;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 100);
    } catch (error) {
      console.error('Error downloading file:', error);
      alert(`Failed to download ${file.fileName}. Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Download all files for a row
   */
  downloadRowFiles(rowIndex: number): void {
    const files = this.getRowFiles(rowIndex).filter(f => f.status === 'completed');
    files.forEach((file, index) => {
      // Add delay between downloads to prevent browser blocking
      setTimeout(() => {
        this.downloadFile(file);
      }, index * 300); // 300ms delay between each file
    });
  }

  /**
   * Download all completed files
   */
  downloadAllFiles(): void {
    const completedFiles = this.getAllFiles().filter(f => f.status === 'completed');
    completedFiles.forEach((file, index) => {
      // Add delay between downloads to prevent browser blocking
      setTimeout(() => {
        this.downloadFile(file);
      }, index * 300); // 300ms delay between each file
    });
  }

  /**
   * Single CSV: every generated post body (markdown) in the run plus metadata and WordPress URLs when present.
   * Failsafe for manual upload if automated WordPress posting fails.
   */
  downloadRunContentCsv(): void {
    const { csv, rowCount } = buildBulkRunContentCsv(this.getAllFiles());
    if (rowCount === 0) return;
    try {
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const d = new Date();
      const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
      const link = document.createElement('a');
      link.href = url;
      link.download = `neo-pulse-bulk-run-content-${stamp}.csv`;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 500);
    } catch (e) {
      console.error('downloadRunContentCsv failed:', e);
    }
  }

  /**
   * Remove all files for a specific row
   */
  removeFilesByRowIndex(rowIndex: number): void {
    const fileIds = this.rowFiles.get(rowIndex);
    if (fileIds) {
      fileIds.forEach(id => this.files.delete(id));
      this.rowFiles.delete(rowIndex);
      this.notify();
    }
  }

  /**
   * Clear all files
   */
  clear(): void {
    this.files.clear();
    this.rowFiles.clear();
    this.notify();
  }

  /**
   * Get statistics
   */
  getStats(): {
    total: number;
    completed: number;
    generating: number;
    pending: number;
    error: number;
    rows: number;
  } {
    const allFiles = this.getAllFiles();
    return {
      total: allFiles.length,
      completed: allFiles.filter(f => f.status === 'completed').length,
      generating: allFiles.filter(f => f.status === 'generating').length,
      pending: allFiles.filter(f => f.status === 'pending').length,
      error: allFiles.filter(f => f.status === 'error').length,
      rows: this.rowFiles.size,
    };
  }

  /**
   * Create a file ID
   */
  static createFileId(rowIndex: number, fileType: string, timestamp: number): string {
    return `bulk-${rowIndex}-${fileType}-${timestamp}`;
  }

  /**
   * Generate filename for a file type
   */
  static generateFileName(
    rowData: BulkGeneratedFile['rowData'],
    fileType:
      | 'blueprint'
      | 'content'
      | 'wikipedia'
      | 'image'
      | 'featured-image-checklist'
      | 'infographic'
      | 'sem_rush'
      | 'dfs_research'
      | 'blog_checklist'
      | 'seo_research_brief'
      | 'selected_keyword'
      | 'link_targets',
    timestamp: number
  ): string {
    const sanitizedTitle = sanitizeFileName(rowData.title);
    const sanitizedEntity = rowData.entity ? sanitizeFileName(rowData.entity) : 'unknown';
    
    switch (fileType) {
      case 'blueprint':
        return `blueprint-${sanitizedTitle}-${timestamp}.json`;
      case 'content':
        return `content-${sanitizedTitle}-${timestamp}.md`;
      case 'sem_rush':
        return `sem_rush-${sanitizedTitle}-${timestamp}.json`;
      case 'dfs_research':
        return `keyword-research-dfs-${sanitizedTitle}-${timestamp}.json`;
      case 'blog_checklist':
        return `blog-checklist-${sanitizedTitle}-${timestamp}.json`;
      case 'seo_research_brief':
        return `serp-research-brief-${sanitizedTitle}-${timestamp}.json`;
      case 'selected_keyword':
        return `selected-keyword-${sanitizedTitle}-${timestamp}.json`;
      case 'link_targets':
        return `link-targets-${sanitizedTitle}-${timestamp}.json`;
      case 'wikipedia':
        return `wikipedia-${sanitizedEntity}-${timestamp}.csv`;
      case 'image':
        return `featured-image-${sanitizedTitle}-${timestamp}.png`;
      case 'featured-image-checklist':
        return `featured-image-checklist-${sanitizedTitle}-${timestamp}.json`;
      case 'infographic':
        return `infographic-${sanitizedTitle}-${timestamp}.json`;
      default:
        return `file-${timestamp}.txt`;
    }
  }
}

