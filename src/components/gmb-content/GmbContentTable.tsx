import React, { useState } from "react";
import { ExternalLink, Megaphone } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { WordPressSite } from "@/components/integrations/types";
import { SocialMediaModal } from "./SocialMediaModal";
import { Button } from "@/ui";

export type GmbContentRow = {
  id: number;
  title: string;
  url: string;
  date: string;
  excerpt: string;
  postType: string;
};

interface GmbContentTableProps {
  rows: GmbContentRow[];
  site: WordPressSite;
  allSites: WordPressSite[];
  loading?: boolean;
}

export const GmbContentTable: React.FC<GmbContentTableProps> = ({
  rows,
  site,
  loading,
}) => {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [modalOpen, setModalOpen] = useState(false);
  const [activeRow, setActiveRow] = useState<GmbContentRow | null>(null);

  const openModal = (row: GmbContentRow) => {
    setActiveRow(row);
    setModalOpen(true);
  };

  const toggleSelect = (id: number) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = () => {
    if (selectedIds.size === rows.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(rows.map((r) => r.id)));
    }
  };

  if (rows.length === 0 && !loading) {
    return (
      <div className="rounded-lg border border-border/40 bg-muted/20 px-4 py-8 text-center">
        <p className="text-base text-muted-foreground">
          No content found for this post type. Publish some content in
          WordPress first.
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
          <span className="text-sm font-medium text-foreground">
            {selectedIds.size} selected
          </span>
        </div>
      )}

      <ScrollArea className="min-h-0 flex-1">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/40 text-left text-muted-foreground">
              <th className="w-10 px-2 py-2">
                <Checkbox
                  checked={
                    rows.length > 0 && selectedIds.size === rows.length
                  }
                  onCheckedChange={toggleAll}
                  aria-label="Select all"
                />
              </th>
              <th className="px-2 py-2 font-medium">Title</th>
              <th className="hidden px-2 py-2 font-medium md:table-cell">
                Date
              </th>
              <th className="w-48 px-2 py-2 text-right font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className="border-b border-border/20 hover:bg-muted/20"
              >
                <td className="px-2 py-2.5">
                  <Checkbox
                    checked={selectedIds.has(row.id)}
                    onCheckedChange={() => toggleSelect(row.id)}
                    aria-label={`Select ${row.title}`}
                  />
                </td>
                <td className="px-2 py-2.5">
                  <div className="flex flex-col gap-0.5">
                    <span className="font-medium text-foreground">
                      {row.title || "(untitled)"}
                    </span>
                    <a
                      href={row.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
                    >
                      <ExternalLink className="h-3 w-3 shrink-0" />
                      <span className="break-words max-w-[260px]">
                        {row.url.replace(/^https?:\/\//, "")}
                      </span>
                    </a>
                  </div>
                </td>
                <td className="hidden px-2 py-2.5 text-muted-foreground md:table-cell">
                  {row.date
                    ? new Date(row.date + "Z").toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })
                    : ""}
                </td>
                <td className="px-2 py-2.5 text-right">
                  <Button
                    onClick={() => openModal(row)}
                  >
                    <Megaphone className="h-3.5 w-3.5" />
                    Create Social Post
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollArea>

      <SocialMediaModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        row={activeRow}
        site={site}
      />
    </div>
  );
};
