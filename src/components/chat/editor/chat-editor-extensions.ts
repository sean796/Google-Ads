import Mention from "@tiptap/extension-mention";
import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import StarterKit from "@tiptap/starter-kit";
import type { Editor, Range } from "@tiptap/core";
import type { Extensions } from "@tiptap/react";
import type { TeamMember } from "@/lib/teams-types";

export type MentionMember = Pick<TeamMember, "userId" | "displayName" | "email">;

type MentionPick = { id: string; label: string };

function insertMentionAtRange(editor: Editor, range: Range, item: MentionPick): void {
  const nodeAfter = editor.view.state.selection.$to.nodeAfter;
  const overrideSpace = nodeAfter?.text?.startsWith(" ");
  const to = overrideSpace ? range.to + 1 : range.to;

  editor
    .chain()
    .focus()
    .insertContentAt(
      { from: range.from, to },
      [
        {
          type: "mention",
          attrs: { id: item.id, label: item.label, mentionSuggestionChar: "@" },
        },
        { type: "text", text: " " },
      ],
    )
    .run();

  editor.view.dom.ownerDocument.defaultView?.getSelection()?.collapseToEnd();
}

export function buildChatEditorExtensions(
  getMembers: () => MentionMember[],
  placeholder = "Message…",
): Extensions {
  return [
    StarterKit.configure({
      heading: false,
      codeBlock: false,
    }),
    Link.configure({
      openOnClick: false,
      autolink: true,
      linkOnPaste: true,
    }),
    Placeholder.configure({ placeholder }),
    Mention.configure({
      HTMLAttributes: {
        class: "chat-accent-pill",
      },
      suggestion: {
        items: ({ query }) => {
          const q = query.toLowerCase();
          return getMembers()
            .filter(
              (m) =>
                m.displayName.toLowerCase().includes(q) ||
                m.email.toLowerCase().includes(q),
            )
            .slice(0, 8)
            .map((m) => ({
              id: String(m.userId),
              label: m.displayName,
              email: m.email,
            }));
        },
        render: () => {
          let list: HTMLDivElement | null = null;
          let selected = 0;
          let items: MentionPick[] = [];
          let latestEditor: Editor | null = null;
          let latestRange: Range | null = null;

          const confirmSelection = (item: MentionPick, range: Range) => {
            if (!latestEditor) return;
            insertMentionAtRange(latestEditor, range, item);
          };

          const updateList = () => {
            if (!list) return;
            list.innerHTML = "";
            items.forEach((item, index) => {
              const btn = document.createElement("button");
              btn.type = "button";
              btn.className =
                index === selected
                  ? "block w-full px-3 py-2 text-left text-base text-black bg-primary/15"
                  : "block w-full px-3 py-2 text-left text-base text-black hover:bg-muted";
              const name = document.createElement("span");
              name.className = "block font-medium";
              name.textContent = `@${item.label}`;
              btn.appendChild(name);
              const email = (item as MentionPick & { email?: string }).email;
              if (email) {
                const emailEl = document.createElement("span");
                emailEl.className = "block text-base text-muted-foreground";
                emailEl.textContent = email;
                btn.appendChild(emailEl);
              }
              btn.addEventListener("mousedown", (e) => {
                e.preventDefault();
                if (!latestRange) return;
                confirmSelection(item, latestRange);
              });
              list.appendChild(btn);
            });
          };

          const bindSuggestion = (props: {
            editor: Editor;
            range: Range;
            items: MentionPick[];
          }) => {
            latestEditor = props.editor;
            latestRange = props.range;
            items = props.items;
            if (selected >= items.length) selected = Math.max(0, items.length - 1);
          };

          return {
            onStart: (props) => {
              bindSuggestion(props as { editor: Editor; range: Range; items: MentionPick[] });
              selected = 0;
              list = document.createElement("div");
              list.className =
                "absolute z-50 max-h-48 min-w-[12rem] overflow-y-auto rounded-md border border-border bg-white py-1 shadow-lg";
              updateList();
              document.body.appendChild(list);
              const rect = props.clientRect?.();
              if (rect && list) {
                list.style.left = `${rect.left}px`;
                list.style.top = `${rect.bottom + 4}px`;
              }
            },
            onUpdate: (props) => {
              bindSuggestion(props as { editor: Editor; range: Range; items: MentionPick[] });
              updateList();
              const rect = props.clientRect?.();
              if (rect && list) {
                list.style.left = `${rect.left}px`;
                list.style.top = `${rect.bottom + 4}px`;
              }
            },
            onKeyDown: ({ event, range }) => {
              if (event.key === "ArrowUp") {
                event.preventDefault();
                selected = Math.max(0, selected - 1);
                updateList();
                return true;
              }
              if (event.key === "ArrowDown") {
                event.preventDefault();
                selected = Math.min(items.length - 1, selected + 1);
                updateList();
                return true;
              }
              if (event.key === "Enter" || event.key === "Tab") {
                event.preventDefault();
                const item = items[selected];
                if (item) confirmSelection(item, range);
                return true;
              }
              return false;
            },
            onExit: () => {
              list?.remove();
              list = null;
              latestEditor = null;
              latestRange = null;
            },
          };
        },
      },
    }),
  ];
}

export function isEditorEmpty(html: string): boolean {
  const stripped = html.replace(/<[^>]*>/g, "").trim();
  return stripped === "";
}
