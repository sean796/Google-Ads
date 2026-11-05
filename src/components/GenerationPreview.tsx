import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";

const isChildrenArray = (children: any) =>
  Array.isArray(children) && children.every((c) => typeof c === "object");

const markdownComponents = {
  table: ({ children, ...props }: any) => <Table {...props}>{children}</Table>,
  thead: ({ children, ...props }: any) => (
    <TableHeader {...props}>{children}</TableHeader>
  ),
  tbody: ({ children, ...props }: any) => (
    <TableBody {...props}>{children}</TableBody>
  ),
  tr: ({ children, ...props }: any) => (
    <TableRow {...props}>{children}</TableRow>
  ),
  th: ({ children, ...props }: any) => (
    <TableHead {...props}>{isChildrenArray(children) ? children[0] : children}</TableHead>
  ),
  td: ({ children, ...props }: any) => (
    <TableCell {...props}>{isChildrenArray(children) ? children[0] : children}</TableCell>
  ),
};

interface GenerationResult {
  content: string;
  isGenerating: boolean;
}

interface GenerationPreviewProps {
  result: GenerationResult;
}

export const GenerationPreview = ({ result }: GenerationPreviewProps) => {
  return (
    <ScrollArea className="h-[calc(100vh-12rem)]">
      <Card className="p-6 bg-node-bg border-node-border">
        {result.isGenerating && (
          <div className="flex items-center gap-2 mb-4 text-primary">
            
            <span className="text-sm">Generating...</span>
          </div>
        )}
        <div className="prose prose-invert max-w-none">
          <ReactMarkdown
            components={markdownComponents as any}
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeRaw]}
            skipHtml={false}
          >
            {result.content}
          </ReactMarkdown>
          {result.isGenerating && result.content && (
            <span className="inline-block w-2 h-4 bg-primary ml-1" />
          )}
        </div>
      </Card>
    </ScrollArea>
  );
};
