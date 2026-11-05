import React from "react";
import type { TaskFile } from "@/lib/tasks-types";
import { taskFileDownloadUrl } from "@/lib/tasks-api";
import { TextButton } from "@/ui";

export type TasksFilesViewProps = {
  teamId: number;
  files: TaskFile[];
  onSelectTask: (taskId: number) => void;
};

export function TasksFilesView({ teamId, files, onSelectTask }: TasksFilesViewProps): React.ReactElement {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-y-auto bg-black p-3">
      {files.length === 0 ? (
        <p className="text-base text-muted-foreground">No files in this project.</p>
      ) : (
        <table className="w-full text-base">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="py-2 pr-4 font-medium">File</th>
              <th className="py-2 pr-4 font-medium">Task</th>
              <th className="py-2 font-medium">Date</th>
            </tr>
          </thead>
          <tbody>
            {files.map((file) => (
              <tr key={file.id} className="text-white">
                <td className="py-2 pr-4">
                  <a
                    href={taskFileDownloadUrl(teamId, file.taskId, file.id)}
                    className="text-primary hover:underline"
                    download={file.fileName}
                  >
                    {file.fileName}
                  </a>
                </td>
                <td className="py-2 pr-4">
                  <TextButton type="button" onClick={() => onSelectTask(file.taskId)}>
                    {file.taskTitle ?? `Task ${file.taskId}`}
                  </TextButton>
                </td>
                <td className="py-2 text-muted-foreground">{file.createdAt.slice(0, 10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
