import React from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { TableKit } from "@tiptap/extension-table";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Italic, Link2, List, ListOrdered, Quote, Table as TableIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { resolveHtmlAssetUrls } from "@/lib/elementor-page-content/resolve-html-asset-urls";
import { normalizeSectionProseHtml } from "@/lib/elementor-page-content/extract-text-editor-prose";

const EDITOR_CONTENT_CLASS = cn(
  "overview-section-prose-editor min-h-24 w-full px-3 py-2 text-base leading-relaxed text-zinc-100 outline-none",
  "[&_.ProseMirror]:min-h-24 [&_.ProseMirror]:outline-none",
  "[&_a]:text-cyan-400 [&_a]:underline",
  "[&_h2]:mt-4 [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-white",
  "[&_h3]:mt-3 [&_h3]:mb-1.5 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-white",
  "[&_p]:my-2.5",
  "[&_ul]:my-2.5 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:my-1",
  "[&_ol]:my-2.5 [&_ol]:list-decimal [&_ol]:pl-5",
  "[&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:border-primary [&_blockquote]:bg-zinc-900/60 [&_blockquote]:px-4 [&_blockquote]:py-2.5 [&_blockquote]:text-cyan-400",
  "[&_img]:my-3 [&_img]:max-h-96 [&_img]:w-auto [&_img]:object-contain",
  "[&_table]:my-4 [&_table]:w-full [&_table]:border-collapse [&_table]:border [&_table]:border-white/15",
  "[&_thead]:bg-zinc-900/90",
  "[&_th]:border [&_th]:border-white/15 [&_th]:bg-zinc-900/90 [&_th]:px-3.5 [&_th]:py-2.5 [&_th]:text-left [&_th]:font-semibold [&_th]:text-white",
  "[&_td]:border [&_td]:border-white/15 [&_td]:px-3.5 [&_td]:py-2.5 [&_td]:align-top [&_td]:text-zinc-200",
  "[&_tr:nth-child(even)_td]:bg-zinc-900/30",
);

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
      type="button"
      variant="ghost"
      size="icon"
      aria-label={label}
      title={label}
      className={cn(
        "h-8 w-8 shrink-0 rounded-none border-0 text-muted-foreground hover:bg-white/10 hover:text-white",
        active && "bg-white/10 text-white",
      )}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

export function OverviewSectionProseEditor({
  value,
  readOnly = false,
  placeholder = "Section copy",
  siteUrl,
  className,
  showToolbarOnFocusOnly = false,
  onChange,
}: {
  value: string;
  readOnly?: boolean;
  placeholder?: string;
  siteUrl?: string;
  className?: string;
  /** Kept for HMR compatibility; toolbar is always rendered for zero CLS. */
  showToolbarOnFocusOnly?: boolean;
  onChange?: (html: string) => void;
}) {
  void showToolbarOnFocusOnly;
  const resolvedValue = React.useMemo(() => {
    const normalized = normalizeSectionProseHtml(value);
    return siteUrl?.trim() ? resolveHtmlAssetUrls(normalized, siteUrl) : normalized;
  }, [value, siteUrl]);
  const onChangeRef = React.useRef(onChange);
  onChangeRef.current = onChange;
  const focusedRef = React.useRef(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false,
        heading: { levels: [2, 3, 4] },
        link: false,
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
      }),
      TableKit.configure({
        table: { resizable: false },
      }),
      Image.configure({
        inline: false,
        allowBase64: true,
      }),
      Placeholder.configure({ placeholder }),
    ],
    content: resolvedValue || "",
    editable: !readOnly,
    onUpdate: ({ editor: ed }) => {
      onChangeRef.current?.(ed.getHTML());
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
    if (readOnly) {
      focusedRef.current = false;
    }
  }, [editor, readOnly]);

  React.useEffect(() => {
    if (!editor || (focusedRef.current && !readOnly)) return;
    const current = editor.getHTML();
    if (current !== resolvedValue) {
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
    return <div className={cn("min-h-24 bg-zinc-900", className)} />;
  }

  return (
    <div
      className={cn(
        "rounded-none border-0 bg-zinc-900 shadow-inner shadow-black/40",
        className,
      )}
    >
      {!readOnly ? (
        <div
          onMouseDown={(e) => e.preventDefault()}
          className="flex items-center gap-1 border-0 border-b border-white/10 px-2 py-1"
        >
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
          <ToolbarButton
            active={editor.isActive("blockquote")}
            label="Blockquote"
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
          >
            <Quote className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive("table")}
            label="Insert 3x3 table"
            onClick={() =>
              editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
            }
          >
            <TableIcon className="h-4 w-4" />
          </ToolbarButton>
        </div>
      ) : null}
      <EditorContent editor={editor} />
    </div>
  );
}
