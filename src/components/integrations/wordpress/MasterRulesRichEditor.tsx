import React from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Italic, Link2, List, ListOrdered } from "lucide-react";
import { cn } from "@/lib/utils";
import { plainTextToEditorHtml } from "@/lib/master-instructions-plain-text";
import { Button } from "@/ui";

const EDITOR_CONTENT_CLASS =
  "master-rules-rich-editor min-h-[9rem] w-full px-3 py-2 text-base leading-relaxed text-white outline-none [&_.ProseMirror]:min-h-[9rem] [&_.ProseMirror]:outline-none [&_a]:text-semantic-analysis-foreground [&_a]:underline [&_li]:my-1 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5";

function ToolbarButton({
  active,
  onClick,
  label,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Button
      variant="quiet"
      type="button"
      aria-label={label}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

export function MasterRulesRichEditor({
  value,
  readOnly = false,
  placeholder = "Type client master rules here",
  className,
  onPlainTextChange,
}: {
  value: string;
  readOnly?: boolean;
  placeholder?: string;
  className?: string;
  onPlainTextChange?: (plainText: string) => void;
}) {
  const resolvedValue = React.useMemo(() => plainTextToEditorHtml(value), [value]);
  const onChangeRef = React.useRef(onPlainTextChange);
  onChangeRef.current = onPlainTextChange;
  const focusedRef = React.useRef(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false,
        heading: false,
        link: false,
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
      }),
      Placeholder.configure({ placeholder }),
    ],
    content: resolvedValue || "",
    editable: !readOnly,
    onUpdate: ({ editor: ed }) => {
      onChangeRef.current?.(ed.getText({ blockSeparator: "\n\n" }));
    },
    onFocus: () => {
      focusedRef.current = true;
    },
    onBlur: () => {
      focusedRef.current = false;
    },
    editorProps: {
      attributes: {
        class: EDITOR_CONTENT_CLASS,
      },
    },
  });

  React.useEffect(() => {
    editor?.setEditable(!readOnly);
  }, [editor, readOnly]);

  React.useEffect(() => {
    if (!editor || focusedRef.current) return;
    const currentHtml = editor.getHTML();
    if (currentHtml !== resolvedValue) {
      editor.commands.setContent(resolvedValue || "", { emitUpdate: false });
    }
  }, [editor, resolvedValue]);

  const addLink = () => {
    if (!editor) return;
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("URL", prev ?? "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };

  if (!editor) {
    return <div className={cn("min-h-[9rem] bg-ui-field", className)} aria-hidden />;
  }

  return (
    <div className={cn("rounded-lg bg-ui-field/50", className)}>
      {!readOnly ? (
        <div className="flex items-center gap-1 px-2 py-1">
          <ToolbarButton
            active={editor.isActive("bold")}
            label="Bold"
            onClick={() => editor.chain().focus().toggleBold().run()}
          >
            <Bold className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive("italic")}
            label="Italic"
            onClick={() => editor.chain().focus().toggleItalic().run()}
          >
            <Italic className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton active={editor.isActive("link")} label="Link" onClick={addLink}>
            <Link2 className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive("bulletList")}
            label="Bullet list"
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          >
            <List className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive("orderedList")}
            label="Numbered list"
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          >
            <ListOrdered className="h-4 w-4" />
          </ToolbarButton>
        </div>
      ) : null}
      <EditorContent editor={editor} />
    </div>
  );
}
