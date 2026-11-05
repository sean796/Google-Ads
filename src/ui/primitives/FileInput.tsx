import * as React from "react";

export type FileInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "className" | "style" | "type">;

/** Hidden file picker opened from a Button via ref.click(). */
export const FileInput = React.forwardRef<HTMLInputElement, FileInputProps>(function FileInput(props, ref) {
  return <input {...props} ref={ref} type="file" className="hidden" />;
});
