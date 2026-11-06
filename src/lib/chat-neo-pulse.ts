import type { TeamMember } from "@/lib/teams-types";

export const NEO_PULSE_BOT_DISPLAY_NAME = "NEO Pulse";
export const NEO_PULSE_BOT_EMAIL = "pulse@neodigital.ca";

/** @deprecated Use NEO_PULSE_BOT_DISPLAY_NAME */
export const FLO_DISPLAY_NAME = NEO_PULSE_BOT_DISPLAY_NAME;
/** @deprecated Use NEO_PULSE_BOT_EMAIL */
export const FLO_EMAIL = NEO_PULSE_BOT_EMAIL;

export function isNeoPulseBotMember(
  member: Pick<TeamMember, "email" | "isBot" | "displayName">,
): boolean {
  return (
    Boolean(member.isBot) ||
    member.email === NEO_PULSE_BOT_EMAIL ||
    member.displayName === NEO_PULSE_BOT_DISPLAY_NAME ||
    member.displayName === "FLO"
  );
}

/** @deprecated Use isNeoPulseBotMember */
export const isFloMember = isNeoPulseBotMember;

export function isNeoPulseBotDisplayName(displayName: string): boolean {
  const normalized = displayName.trim().toUpperCase();
  return normalized === NEO_PULSE_BOT_DISPLAY_NAME.toUpperCase() || normalized === "FLO";
}

/** @deprecated Use isNeoPulseBotDisplayName */
export const isFloDisplayName = isNeoPulseBotDisplayName;

export function pulseMemberUserId(
  members: Pick<TeamMember, "email" | "isBot" | "displayName" | "userId">[],
): number | null {
  const pulse = members.find((member) => isNeoPulseBotMember(member));
  return pulse?.userId ?? null;
}

export function pulseAssigneeIds(
  members: Pick<TeamMember, "email" | "isBot" | "displayName" | "userId">[],
): number[] | undefined {
  const pulseUserId = pulseMemberUserId(members);
  return pulseUserId != null ? [pulseUserId] : undefined;
}

export function sortMembersWithNeoPulseBotFirst(members: TeamMember[]): TeamMember[] {
  const bot = members.filter(isNeoPulseBotMember);
  const rest = members.filter((m) => !isNeoPulseBotMember(m));
  return [...bot, ...rest];
}

/** @deprecated Use sortMembersWithNeoPulseBotFirst */
export const sortMembersWithFloFirst = sortMembersWithNeoPulseBotFirst;
