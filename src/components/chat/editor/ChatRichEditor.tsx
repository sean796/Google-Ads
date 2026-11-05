import React, { forwardRef, useImperativeHandle, useRef } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import {
  Bold,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Quote,
  Strikethrough,
  Code,
} from "lucide-react";
import {
  CHAT_EDITOR_CONTENT_CLASS,
  CHAT_EDITOR_ROOT_CLASS,
  CHAT_EDITOR_TOOLBAR_CLASS,
  CHAT_ICON_BTN_CLASS,
} from "@/components/chat/chat-theme";
import { cn } from "@/lib/utils";
import {
  buildChatEditorExtensions,
  isEditorEmpty,
  type MentionMember,
} from "@/components/chat/editor/chat-editor-extensions";
import { ChatAiToolbar } from "@/components/chat/editor/ChatAiToolbar";
import { Button } from "@/ui";

export type ChatRichEditorHandle = {
  getHtml: () => string;
  setHtml: (html: string) => void;
  focus: () => void;
};

export type ChatRichEditorProps = {
  members: MentionMember[];
  disabled?: boolean;
  placeholder?: string;
  content?: string;
  onChange?: (html: string) => void;
  onSubmit: (html: string) => void;
  className?: string;
  showAiToolbar?: boolean;
  submitOnEnter?: boolean;
  allowEmptySubmit?: boolean;
  compactToolbar?: boolean;
  toolbarStart?: React.ReactNode;
};

function ToolbarButton({
  active,
  onClick,
  children,
  label,
}: {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  label: string;
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

export const ChatRichEditor = forwardRef<ChatRichEditorHandle, ChatRichEditorProps>(function ChatRichEditor(
  {
    members,
    disabled,
    placeholder,
    content,
    onChange,
    onSubmit,
    className,
    showAiToolbar = true,
    submitOnEnter = true,
    allowEmptySubmit = false,
    compactToolbar = false,
    toolbarStart,
  },
  ref,
) {
  const membersRef = useRef(members);
  membersRef.current = members;
  const onSubmitRef = useRef(onSubmit);
  onSubmitRef.current = onSubmit;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const submitOnEnterRef = useRef(submitOnEnter);
  submitOnEnterRef.current = submitOnEnter;
  const allowEmptySubmitRef = useRef(allowEmptySubmit);
  allowEmptySubmitRef.current = allowEmptySubmit;
  const editorRef = useRef<ReturnType<typeof useEditor>>(null);
  const aiHandleRef = useRef<ChatRichEditorHandle | null>(null);

  const editor = useEditor({
    extensions: buildChatEditorExtensions(() => membersRef.current, placeholder),
    content: content ?? "",
    editable: !disabled,
    onUpdate: ({ editor: ed }) => {
      onChangeRef.current?.(ed.getHTML());
    },
    editorProps: {
      attributes: {
        class: CHAT_EDITOR_CONTENT_CLASS,
      },
      handleKeyDown: (_view, event) => {
        if (submitOnEnterRef.current && event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          const ed = editorRef.current;
          if (!ed) return true;
          const html = ed.getHTML();
          if (!isEditorEmpty(html) || allowEmptySubmitRef.current) {
            onSubmitRef.current(html);
            ed.commands.clearContent();
          }
          return true;
        }
        return false;
      },
    },
    onCreate: ({ editor: ed }) => {
      editorRef.current = ed;
    },
  });

  useImperativeHandle(
    ref,
    () => {
      const handle: ChatRichEditorHandle = {
        getHtml: () => editorRef.current?.getHTML() ?? "",
        setHtml: (html: string) => {
          editorRef.current?.commands.setContent(html);
          onChangeRef.current?.(html);
        },
        focus: () => editorRef.current?.commands.focus(),
      };
      aiHandleRef.current = handle;
      return handle;
    },
    [editor],
  );

  React.useEffect(() => {
    editor?.setEditable(!disabled);
  }, [disabled, editor]);

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
    return <div className={cn("min-h-[6rem] chat-surface", className)} />;
  }

  return (
    <div className={cn(CHAT_EDITOR_ROOT_CLASS, className)}>
      <div className={cn(CHAT_EDITOR_TOOLBAR_CLASS, compactToolbar && "chat-editor-toolbar--compact")}>
        <div className={cn(compactToolbar && "chat-editor-format-row flex min-w-0 flex-1 items-center")}>
          {toolbarStart}
          <ToolbarButton
            label="Bold"
            active={editor.isActive("bold")}
            onClick={() => editor.chain().focus().toggleBold().run()}
          >
            <Bold className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            label="Italic"
            active={editor.isActive("italic")}
            onClick={() => editor.chain().focus().toggleItalic().run()}
          >
            <Italic className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            label="Strikethrough"
            active={editor.isActive("strike")}
            onClick={() => editor.chain().focus().toggleStrike().run()}
          >
            <Strikethrough className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            label="Code"
            active={editor.isActive("code")}
            onClick={() => editor.chain().focus().toggleCode().run()}
          >
            <Code className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            label="Bullet list"
            active={editor.isActive("bulletList")}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          >
            <List className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            label="Ordered list"
            active={editor.isActive("orderedList")}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          >
            <ListOrdered className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            label="Quote"
            active={editor.isActive("blockquote")}
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
          >
            <Quote className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton label="Link" active={editor.isActive("link")} onClick={addLink}>
            <LinkIcon className="h-4 w-4" />
          </ToolbarButton>
        </div>
        {showAiToolbar ? (
          compactToolbar ? (
            <ChatAiToolbar
              editorRef={aiHandleRef}
              disabled={disabled}
              onHtmlChange={onChange}
              inline
              variant="spark-dropdown"
            />
          ) : (
            <div className="chat-editor-ai-row flex shrink-0 items-center gap-0.5">
              <ChatAiToolbar editorRef={aiHandleRef} disabled={disabled} onHtmlChange={onChange} inline />
            </div>
          )
        ) : null}
      </div>
      <EditorContent editor={editor} />
    </div>
  );
});

export { isEditorEmpty };
