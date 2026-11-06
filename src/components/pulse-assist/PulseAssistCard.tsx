import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useMemo } from "react";
import { usePulseAssistContext } from "@/contexts/pulse-assist-context";
import { useAgentRunsContext } from "@/contexts/use-agent-runs-context";
import { useTeam } from "@/contexts/TeamContext";
import type { AssistCard, AssistCardLink, AssistCardTable, AssistNavigateTarget } from "@/lib/pulse-assist/types";
import { isInAppAssistHref, isPulseAssistHref, parseAppHref, parsePulseAssistHref } from "@/lib/pulse-assist/navigation";
import { createPulseAssistMarkdownComponents } from "./pulse-assist-markdown-components";
import { filterLinksToBodyScope, stripStructuredFieldLeaks } from "@/lib/pulse-assist/cards";
import { normalizeAssistDisplayMarkdown, normalizeAssistTopicLabel } from "@/lib/pulse-assist/display-markdown";
import { mergeAssistCardLinks } from "@/lib/pulse-assist/history";
import { cn } from "@/lib/utils";
import { Button } from "@/ui";

type PulseAssistCardProps = {
  card: AssistCard;
  onSubmodeSwitch?: (submode: string) => void;
  onTopicClick?: (topic: string) => void;
  onUndo?: (postId: number) => void;
};

function CardLinks({
  links,
  onUndo,
  onNavigate,
  onOpenAgentRuns,
}: {
  links?: AssistCardLink[];
  onUndo?: (postId: number) => void;
  onNavigate: (target: AssistNavigateTarget) => void;
  onOpenAgentRuns?: (runId?: number) => void;
}) {
  if (!links?.length) return null;
  return (
    <div className="fcw-card__links">
      {links.map((link, i) => {
        const postId = link.post_id || (link.action === "undo" ? link.post_id : undefined);
        if (link.action === "undo" && postId && onUndo) {
          return (
            <Button
              variant="quiet"
              key={`undo-${i}`}
              onClick={() => onUndo(postId)}
            >
              {link.label || "Undo"}
            </Button>
          );
        }
        const navTarget =
          link.navigate ??
          (link.url && isPulseAssistHref(link.url) ? parsePulseAssistHref(link.url) : null) ??
          (link.url && isInAppAssistHref(link.url) ? parseAppHref(link.url) : null);
        if ((link.action === "navigate" || navTarget) && navTarget) {
          if (navTarget.kind === "agentRuns") {
            return (
              <Button
                variant="quiet"
                key={`nav-${i}`}
                onClick={() => onOpenAgentRuns?.(navTarget.runId)}
              >
                {link.label || "Open Running Agents"}
              </Button>
            );
          }
          return (
            <Button
              variant="quiet"
              key={`nav-${i}`}
              onClick={() => onNavigate(navTarget)}
            >
              {link.label || link.url}
            </Button>
          );
        }
        if (link.url) {
          return (
            <a
              key={`link-${i}`}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="fcw-card__link"
            >
              {link.label || link.url}
            </a>
          );
        }
        return null;
      })}
    </div>
  );
}

type AssistCardTableInput = {
  columns?: readonly unknown[];
  rows?: readonly unknown[];
};

function normalizeAssistCardTable(table: AssistCardTableInput | null | undefined): AssistCardTable | null {
  if (!table?.columns?.length) return null;
  const columns = table.columns.map((col) => String(col ?? "").trim()).filter(Boolean);
  if (!columns.length) return null;
  const rows = (table.rows ?? [])
    .map((row) => {
      if (Array.isArray(row)) {
        return columns.map((_, index) => String(row[index] ?? "").trim());
      }
      if (typeof row === "string" && row.trim()) {
        return [row.trim()];
      }
      return [];
    })
    .filter((row) => row.some((cell) => cell !== ""));
  if (!rows.length) return null;
  return { columns, rows };
}

function AssistCardTable({ table }: { table: NonNullable<AssistCard["table"]> }) {
  const normalized = normalizeAssistCardTable(table);
  if (!normalized?.columns.length || !normalized.rows.length) return null;
  return (
    <div className="fcw-md-table-wrap fcw-card__table-wrap">
      <table className="fcw-md-table">
        <thead className="fcw-md-thead">
          <tr className="fcw-md-tr">
            {normalized.columns.map((col) => (
              <th key={col} className="fcw-md-th">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="fcw-md-tbody">
          {normalized.rows.map((row, rowIndex) => (
            <tr key={`row-${rowIndex}`} className="fcw-md-tr">
              {row.map((cell, cellIndex) => (
                <td key={`cell-${rowIndex}-${cellIndex}`} className="fcw-md-td">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PulseAssistCard({
  card,
  onSubmodeSwitch,
  onTopicClick,
  onUndo,
}: PulseAssistCardProps) {
  const { navigateTo, activeSiteId, managerTab, overview } = usePulseAssistContext();
  const { startRun, openSidebar } = useAgentRunsContext();
  const { activeTeam } = useTeam();
  const markdownComponents = useMemo(
    () => createPulseAssistMarkdownComponents(navigateTo),
    [navigateTo],
  );
  const displayBody = normalizeAssistDisplayMarkdown(stripStructuredFieldLeaks(card.body ?? ""));
  const type = card.type || "answer";
  const topics = (card.relatedTopics || card.suggested_actions || [])
    .filter((topic): topic is string => typeof topic === "string" && topic.trim() !== "")
    .map((topic) => normalizeAssistTopicLabel(topic))
    .filter(Boolean);
  const links = filterLinksToBodyScope(mergeAssistCardLinks(card.links, displayBody), displayBody);
  const showTitle =
    card.title &&
    card.title !== "NEO Pulse Assist" &&
    card.title !== "NEO Pulse Assist error";

  return (
    <div className={cn("fcw-card", `fcw-card--${type}`)}>
      {showTitle ? <div className="fcw-card__title">{card.title}</div> : null}
      {card.table ? <AssistCardTable table={card.table} /> : null}
      {displayBody ? (
        <div className="fcw-card__body fcw-card__body--markdown">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {displayBody}
          </ReactMarkdown>
        </div>
      ) : null}
      {Array.isArray(card.steps) && card.steps.length > 0 ? (
        <ul className="fcw-card__steps">
          {card.steps.map((step, i) => (
            <li
              key={`${step.label}-${i}`}
              className={cn(
                "fcw-card__step",
                step.status === "running" && "fcw-card__step--running",
                step.status === "done" && "fcw-card__step--done",
                step.status === "error" && "fcw-card__step--error",
              )}
            >
              {step.label}
            </li>
          ))}
        </ul>
      ) : null}
      <CardLinks links={links} onUndo={onUndo} onNavigate={navigateTo} onOpenAgentRuns={openSidebar} />
      {type === "automation_dispatch" && card.cta?.action === "agent_run_dispatch" && activeTeam?.id ? (
        <Button
          variant="quiet"
          onClick={() => {
            void startRun({
              teamId: activeTeam.id,
              source: "pulse_assist",
              recipeKey: String(card.recipe_key ?? ""),
              title: card.title,
              context: {
                ...(card.context_json ?? {}),
                siteId: activeSiteId ?? (card.context_json?.siteId as string | undefined),
                managerTab,
                sitemapSource: overview.sitemapSource ?? (card.context_json?.sitemapSource as string | undefined),
              },
              plan: card.plan_json ?? {},
            });
          }}
        >
          {card.cta?.label || "Run automation"}
        </Button>
      ) : null}
      {card.submode_switch && onSubmodeSwitch ? (
        <Button
          variant="quiet"
          onClick={() => onSubmodeSwitch(String(card.submode_switch))}
        >
          {card.submode_switch === "build"
            ? "Create tasks (Build mode)"
            : `Switch to ${String(card.submode_switch)} mode`}
        </Button>
      ) : null}
      {topics.length > 0 && onTopicClick ? (
        <div className="fcw-topic-chips">
          {topics.map((topic) => (
            <Button
              variant="quiet"
              key={topic}
              onClick={() => onTopicClick(topic)}
            >
              {topic}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function PulseAssistUserBubble({ text }: { text: string }) {
  return (
    <div className="fcw-msg fcw-msg--user">
      <div className="fcw-user-bubble">{text}</div>
    </div>
  );
}

export function PulseAssistAckBubble({ text }: { text: string }) {
  return (
    <div className="fcw-msg fcw-msg--assistant fcw-msg--ack">
      <div className="fcw-ack-bubble">{text}</div>
    </div>
  );
}
