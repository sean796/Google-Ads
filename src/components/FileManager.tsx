import { useState } from "react";

import { Upload, X, FileText } from "lucide-react";
import { notify } from "@/lib/app-notifications";
import { NOTIFY_SOME_FILES_WERE_REJECTED_ONLY_TEXT_PDF_J } from "@/lib/notify-messages";
import { Button, FileInput, Card } from "@/ui";

interface FileManagerProps {
  files: File[];
  onFilesChange: (files: File[]) => void;
}

export const FileManager = ({ files, onFilesChange }: FileManagerProps) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const droppedFiles = Array.from(e.dataTransfer.files);
    const validFiles = droppedFiles.filter(file => 
      file.type === 'text/plain' || 
      file.type === 'application/pdf' ||
      file.type === 'application/json' ||
      file.type === 'text/csv' ||
      file.name.endsWith('.csv') ||
      file.name.endsWith('.md')
    );
    
    if (validFiles.length !== droppedFiles.length) {
      notify.error(NOTIFY_SOME_FILES_WERE_REJECTED_ONLY_TEXT_PDF_J);
    }
    
    onFilesChange([...files, ...validFiles]);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      onFilesChange([...files, ...newFiles]);
    }
  };

  const removeFile = (index: number) => {
    onFilesChange(files.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-4">
      <div
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          isDragging ? 'border-primary bg-primary/5' : 'border-border'
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        <Upload className="w-8 h-8 mx-auto mb-4 text-muted-foreground" />
        <p className="text-sm text-muted-foreground mb-2">
          Drag and drop RAG files here, or click to browse
        </p>
        <FileInput
          multiple
          accept=".txt,.pdf,.json,.md,.csv"
          onChange={handleFileInput}
          id="file-upload"
        />
        <Button
          onClick={() => document.getElementById('file-upload')?.click()}
        >
          Browse Files
        </Button>
      </div>

      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((file, index) => (
            <Card key={index} className="p-3 bg-node-bg border-node-border flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileText className="w-4 h-4 text-primary" />
                <div>
                  <p className="text-sm font-medium text-foreground">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(file.size / 1024).toFixed(2)} KB
                  </p>
                </div>
              </div>
              <Button
                variant="quiet"
                onClick={() => removeFile(index)}
              >
                <X className="w-4 h-4" />
              </Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
