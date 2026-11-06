import { buildAutomationEmailIntro } from "@/lib/automation-email-intro";
import {
  formatGscMeetingScriptMarkdown,
  gscMeetingScriptFile,
} from "@/lib/gsc-reporting/gsc-reporting-meeting-script-markdown";
import { resolveOpenRouterApiKeyForHarness } from "@/lib/openrouter-api-key-resolve";
import { sendTeamMail } from "@/lib/teams-api";
import { patchTaskExecutionProgress } from "@/lib/tasks-api";
import type { AgentRun } from "@/lib/agent-runs-types";
import type { TaskArchiveFileInput } from "@/lib/task-execution-archive";
import type { TaskExecutionClientRunContract, TaskExecutionKind } from "@/lib/tasks-types";
import { inferAutomationDeliveryStepKey } from "@/lib/workflow/automation-delivery-log";

export type AutomationEmailTokenContext = {
  siteName: string;
  siteUrl?: string;
  automationTitle: string;
  executionKind: TaskExecutionKind;
  compareLabel?: string;
  comparePreset?: "mom" | "yoy";
  summary?: string;
  attachmentDateStamp?: number;
  driveLinks?: string;
  deliverableCount?: number;
  deliverableList?: string;
};

export type AutomationEmailDeliveryResult = {
  emailSent?: boolean;
  emailError?: string;
  emailSkipped?: boolean;
  emailSkipReason?: string;
  transport?: string;
  meetingScriptFile?: TaskArchiveFileInput;
};

type EmailStepStatus = "running" | "done" | "error";

const ARCHIVE_FOOTER = "Full run output is saved in your team archive in Neo Pulse.";
const ATTACHMENT_FOOTER = "The final report is attached to this email.";
const GSC_ATTACHMENTS_FOOTER = "Meeting notes and final report are attached to this email.";

export function automationTitleFromRun(run: AgentRun): string {
  return (
    String(run.recipeTitle ?? run.title ?? run.taskTitle ?? "Automation").trim() || "Automation"
  );
}

export function executionKindFromRun(run: AgentRun): TaskExecutionKind {
  const recipe = String(run.recipeKey ?? "");
  if (recipe === "gsc_reporting") return "gsc_reporting";
  if (recipe === "ads_reporting") return "ads_reporting";
  if (recipe === "post_creator") return "post_creator";
  if (recipe === "dfs_llm_article_audit") return "dfs_llm_article_audit";
  if (recipe === "overview_pages_meta_batch") return "content_optimizer_meta";
  if (recipe === "content_optimizer_bulk") return "content_optimizer";
  return "";
}

function formatDateToken(): string {
  return new Date().toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function resolveAutomationEmailTokens(
  template: string,
  ctx: AutomationEmailTokenContext,
): string {
  const kindLabel = ctx.executionKind.replace(/_/g, " ").trim();
  const deliverableCount = String(ctx.deliverableCount ?? 0);
  const deliverableList = ctx.deliverableList ?? "";
  const driveLinks = ctx.driveLinks ?? "";
  return template
    .split("{siteName}")
    .join(ctx.siteName)
    .split("{automationTitle}")
    .join(ctx.automationTitle)
    .split("{date}")
    .join(formatDateToken())
    .split("{executionKind}")
    .join(kindLabel)
    .split("{compareLabel}")
    .join(ctx.compareLabel ?? "")
    .split("{summary}")
    .join(ctx.summary ?? "")
    .split("{driveLinks}")
    .join(driveLinks)
    .split("{deliverableCount}")
    .join(deliverableCount)
    .split("{deliverableList}")
    .join(deliverableList);
}

function defaultSubject(ctx: AutomationEmailTokenContext): string {
  return resolveAutomationEmailTokens(
    "{siteName} automation summary ({date})",
    ctx,
  );
}

function composeGscEmailBody(args: {
  intro: string;
  highlights: string[];
  driveLinksBlock?: string;
}): string {
  const lines = [args.intro.trim(), "", "Highlights:"];
  for (const item of args.highlights) {
    const bullet = item.trim();
    if (bullet) lines.push(`- ${bullet}`);
  }
  const linkBlock = args.driveLinksBlock?.trim() ?? "";
  if (linkBlock) {
    lines.push("", "Links:", linkBlock);
  }
  lines.push("", GSC_ATTACHMENTS_FOOTER);
  return lines.join("\n");
}

function composeEmailBody(
  intro: string,
  bullets: string[],
  footer: string,
  bulletHeading = "Highlights:",
): string {
  const lines = [intro.trim()];
  if (bullets.length > 0) {
    lines.push("", bulletHeading);
    for (const item of bullets) {
      lines.push(`- ${item}`);
    }
  }
  lines.push("", footer);
  return lines.join("\n");
}

function formatGscEmailDriveLinks(driveLinks: string): string {
  const trimmed = driveLinks.trim();
  if (!trimmed) return "";
  return trimmed
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

function composeStaticEmailBody(
  contract: TaskExecutionClientRunContract,
  ctx: AutomationEmailTokenContext,
  hasAttachments: boolean,
): string {
  const staticMessage = String(contract.automationEmailMessage ?? "").trim();
  const opener =
    staticMessage ||
    resolveAutomationEmailTokens(
      "Hi, your {automationTitle} run for {siteName} is complete.",
      ctx,
    );
  return composeEmailBody(
    opener,
    ctx.summary ? [ctx.summary] : [],
    hasAttachments ? ATTACHMENT_FOOTER : ARCHIVE_FOOTER,
  );
}

async function resolveEmailSubjectAndBody(args: {
  contract: TaskExecutionClientRunContract;
  tokenContext: AutomationEmailTokenContext;
  summaryText: string;
  hasReportAttachment: boolean;
}): Promise<{
  subject: string;
  body: string;
  meetingScriptFile?: TaskArchiveFileInput;
}> {
  const subjectTemplate = String(args.contract.automationEmailSubject ?? "").trim();
  let subject = subjectTemplate
    ? resolveAutomationEmailTokens(subjectTemplate, args.tokenContext)
    : defaultSubject(args.tokenContext);

  const requiresAiIntro =
    args.contract.automationEmailAiIntro === true ||
    args.tokenContext.executionKind === "gsc_reporting";

  if (requiresAiIntro) {
    const apiKey = (await resolveOpenRouterApiKeyForHarness()).trim();
    if (!apiKey) {
      throw new Error("OpenRouter API key is required for automation email intro.");
    }
    const intro = await buildAutomationEmailIntro({
      apiKey,
      executionKind: args.tokenContext.executionKind,
      siteName: args.tokenContext.siteName,
      automationTitle: args.tokenContext.automationTitle,
      summaryText: args.summaryText,
      compareLabel: args.tokenContext.compareLabel,
    });
    if (intro.subject?.trim()) {
      subject = resolveAutomationEmailTokens(intro.subject.trim(), args.tokenContext);
    }

    const driveLinksBlock = formatGscEmailDriveLinks(args.tokenContext.driveLinks ?? "");

    if (args.tokenContext.executionKind === "gsc_reporting") {
      const comparePreset = args.tokenContext.comparePreset ?? "mom";
      const dateStamp = args.tokenContext.attachmentDateStamp ?? Date.now();
      const scriptMarkdown = formatGscMeetingScriptMarkdown({
        siteName: args.tokenContext.siteName,
        compareLabel: args.tokenContext.compareLabel,
        comparePreset,
        highlights: intro.highlights,
        talkingPoints: intro.talkingPoints ?? intro.highlights,
        clientQuestions: intro.clientQuestions ?? [],
      });
      const meetingScriptFile = gscMeetingScriptFile({
        siteName: args.tokenContext.siteName,
        comparePreset,
        content: scriptMarkdown,
        dateStamp,
      });
      return {
        subject,
        body: composeGscEmailBody({
          intro: intro.intro,
          highlights: intro.highlights,
          driveLinksBlock,
        }),
        meetingScriptFile,
      };
    }

    return {
      subject,
      body: composeEmailBody(
        intro.intro,
        intro.highlights,
        args.hasReportAttachment ? ATTACHMENT_FOOTER : ARCHIVE_FOOTER,
        intro.bulletHeading,
      ),
    };
  }

  return {
    subject,
    body: composeStaticEmailBody(args.contract, args.tokenContext, args.hasReportAttachment),
  };
}

export async function sendAutomationEmailIfConfigured(args: {
  teamId: number;
  executionId: number;
  contract: TaskExecutionClientRunContract | Record<string, unknown>;
  tokenContext: AutomationEmailTokenContext;
  summaryText: string;
  attachments?: TaskArchiveFileInput[];
  runOk?: boolean;
  onStep?: (
    label: string,
    status?: EmailStepStatus,
    resumePayload?: Record<string, unknown>,
    stepKey?: string,
  ) => void | Promise<void>;
}): Promise<AutomationEmailDeliveryResult> {
  const reportStep = async (label: string, status: EmailStepStatus = "running") => {
    const stepKey = inferAutomationDeliveryStepKey(label, status);
    await args.onStep?.(label, status, { phase: "automation_delivery" }, stepKey);
  };

  if (args.runOk === false) {
    await reportStep("Email skipped (run failed)", "error");
    return {
      emailSkipped: true,
      emailSkipReason: "Run did not complete successfully.",
    };
  }

  const contract = args.contract as TaskExecutionClientRunContract;
  if (!contract.sendAutomationEmail) {
    return {
      emailSkipped: true,
      emailSkipReason: "sendAutomationEmail not set on run contract.",
    };
  }

  const to = String(contract.automationEmailTo ?? "").trim();
  if (!to) {
    await reportStep("Email failed (recipient required)", "error");
    return { emailSent: false, emailError: "Recipient email is required." };
  }

  await reportStep(`Email: sending · ${to}`, "running");
  await patchTaskExecutionProgress(args.teamId, args.executionId, {
    message: "Sending email…",
    progress: 0.98,
  });

  let subject: string;
  let body: string;
  let meetingScriptFile: TaskArchiveFileInput | undefined;
  const reportAttachments = (args.attachments ?? []).filter(
    (file) => file.fileName.trim() && file.content.trim(),
  );
  try {
    const resolved = await resolveEmailSubjectAndBody({
      contract,
      tokenContext: args.tokenContext,
      summaryText: args.summaryText,
      hasReportAttachment: reportAttachments.length > 0,
    });
    subject = resolved.subject;
    body = resolved.body;
    meetingScriptFile = resolved.meetingScriptFile;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Email compose failed.";
    await reportStep(`Email failed (${message})`, "error");
    return { emailSent: false, emailError: message };
  }

  const attachments = [
    ...(meetingScriptFile ? [meetingScriptFile] : []),
    ...reportAttachments,
  ];

  const mail = await sendTeamMail(args.teamId, {
    to,
    subject,
    message: body,
    attachments,
  });
  if (!mail.ok) {
    const message = mail.error ?? "Email send failed.";
    await reportStep(`Email failed (${message})`, "error");
    return { emailSent: false, emailError: message, transport: mail.transport };
  }

  await reportStep("Email: sent", "done");
  return {
    emailSent: true,
    transport: mail.transport,
    ...(meetingScriptFile ? { meetingScriptFile } : {}),
  };
}
