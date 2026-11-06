import React from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { marked } from "marked";
import { notify } from "@/lib/app-notifications";
import { NOTIFY_NO_HTML_CONTENT_GENERATED, notifyNoXContentToCopy, notifyXCopiedToClipboard } from "@/lib/notify-messages";
import { htmlToMarkdown } from "@/lib/wordpress-converter";

/** Manager Panel: ensure content is Markdown. Converts any HTML tables/links to Markdown before display. */
const ensureMarkdownForDisplay = (content: string): string => {
  if (!content?.trim()) return content;
  if (/<(?:table|tr|td|th|thead|tbody|a\s+href)[\s>]/i.test(content)) {
    return htmlToMarkdown(content);
  }
  return content;
};

export const formatMarkdownContent = (content: string) => {
  const toRender = ensureMarkdownForDisplay(content);
  const props: { components: Components } = {
    components: {
      a: ({ node, ...rest }) => <a style={{ color: '#FFFFFF', textDecoration: 'underline' }} {...rest} />,
      strong: ({ node, ...rest }) => <strong style={{ color: '#FFFFFF' }} {...rest} />,
      li: ({ node, ...rest }) => <li style={{ color: '#FFFFFF' }} {...rest} />,
      span: ({ node, ...rest }) => <span style={{ color: '#FFFFFF' }} {...rest} />,
      p: ({ node, ...rest }) => <p style={{ color: '#FFFFFF' }} {...rest} />,
      h1: ({ node, ...rest }) => <h1 style={{ color: '#FFFFFF', fontSize: '2em', fontWeight: 'bold' }} {...rest} />,
      h2: ({ node, ...rest }) => <h2 style={{ color: '#FFFFFF', fontSize: '1.5em', fontWeight: 'bold' }} {...rest} />,
      h3: ({ node, ...rest }) => <h3 style={{ color: '#FFFFFF', fontSize: '1.25em', fontWeight: 'bold' }} {...rest} />,
      ol: ({ node, ...rest }) => <ol style={{ color: '#FFFFFF' }} {...rest} />,
      ul: ({ node, ...rest }) => <ul style={{ color: '#FFFFFF' }} {...rest} />,
      table: ({ node, ...rest }) => <table style={{ color: '#FFFFFF', borderColor: '#FFFFFF', border: '1px solid currentColor' }} {...rest} />,
      thead: ({ node, ...rest }) => <thead style={{ color: '#FFFFFF' }} {...rest} />,
      tbody: ({ node, ...rest }) => <tbody style={{ color: '#FFFFFF' }} {...rest} />,
      tr: ({ node, ...rest }) => <tr style={{ color: '#FFFFFF' }} {...rest} />,
      th: ({ node, ...rest }) => <th style={{ color: '#FFFFFF', borderColor: '#FFFFFF', border: '1px solid currentColor', padding: '8px' }} {...rest} />,
      td: ({ node, ...rest }) => <td style={{ color: '#FFFFFF', borderColor: '#FFFFFF', border: '1px solid currentColor', padding: '8px' }} {...rest} />,
      code: ({ node, ...rest }) => <code style={{ color: '#FFFFFF', backgroundColor: 'transparent' }} {...rest} />,
      pre: ({ node, ...rest }) => <pre style={{ color: '#FFFFFF', backgroundColor: 'transparent' }} {...rest} />,
    }
  };

  return (
    <div style={{ color: '#FFFFFF' }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        {...props}
      >
        {toRender}
      </ReactMarkdown>
    </div>
  );
};

export const handleCopy = (text: string, type: 'markdown' | 'html') => {
  let contentToCopy = text;

  if (type === 'html') {
    // Convert markdown to HTML using marked
    contentToCopy = marked.parse(text, { async: false }) as string || "";
    if (!contentToCopy) {
      notify.error(NOTIFY_NO_HTML_CONTENT_GENERATED);
      return;
    }
  }

  if (!contentToCopy) {
    notify.error(notifyNoXContentToCopy(type));
    return;
  }

  navigator.clipboard.writeText(contentToCopy);
  notify.success(notifyXCopiedToClipboard(type));
};

export const formatElapsedTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

