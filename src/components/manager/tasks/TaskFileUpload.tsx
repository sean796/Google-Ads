import React, { useCallback, useRef } from "react";
import { Paperclip } from "lucide-react";
import { BULK_HEADER_TOOL_BTN } from "@/components/keyword-research/bulk/bulk-workspace-header-styles";
import type { TaskFile } from "@/lib/tasks-types";
import { taskFileDownloadUrl } from "@/lib/tasks-api";
import { Button, FileInput } from "@/ui";

const ACCEPT =
  ".pdf,.txt,.csv,.json,.md,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.gif,.webp";

export type TaskFileUploadProps = {
  teamId: number;
  taskId: number;
  files: TaskFile[];
  uploading: boolean;
  onUpload: (file: File) => void;
};

export function TaskFileUpload({
  teamId,
  taskId,
  files,
  uploading,
  onUpload,
}: TaskFileUploadProps): React.ReactElement {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    (fileList: FileList | null) => {
      if (!fileList?.length) return;
      for (let i = 0; i < fileList.length; i++) {
        const file = fileList.item(i);
        if (file) onUpload(file);
      }
    },
    [onUpload],
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <p className="text-base font-semibold text-white">Files</p>
        <Button
          variant="run"
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          <Paperclip className="mr-1.5 h-4 w-4" />
          Upload
        </Button>
        <FileInput
          ref={inputRef}
          accept={ACCEPT}
          multiple
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
      {files.length === 0 ? (
        <p className="text-base text-muted-foreground">No files attached.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {files.map((file) => (
            <li key={file.id}>
              <a
                href={taskFileDownloadUrl(teamId, taskId, file.id)}
                className="text-base text-primary hover:underline"
                download={file.fileName}
              >
                {file.fileName}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
