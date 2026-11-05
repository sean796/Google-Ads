import { useState } from "react";
import { DASHBOARD_SETTINGS_GROUP_CLASS } from "@/components/manager/dashboard/dashboard-panel-styles";
import { useTeam } from "@/contexts/TeamContext";
import { TeamMemberProfilePanel } from "@/components/manager/teams/TeamMemberProfilePanel";
import type { TeamMember } from "@/lib/teams-types";
import { cn } from "@/lib/utils";
import { Button } from "@/ui";

const MEMBER_GRID_CLASS =
  "grid w-full min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)_auto_auto] items-center gap-x-4 gap-y-2 sm:gap-x-6";

const MEMBER_HEADER_CLASS = "text-base font-semibold text-white/60";

export function TeamSeatManagerPanel() {
  const { activeTeam, members, refreshMembers } = useTeam();
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);

  if (!activeTeam) return null;

  const selectedMember = members.find((m) => m.userId === selectedUserId) ?? null;

  return (
    <div className={DASHBOARD_SETTINGS_GROUP_CLASS}>
      <p className="font-semibold text-white">Members</p>

      {members.length === 0 ? (
        <p className="text-base text-white">No members yet.</p>
      ) : (
        <div className="space-y-3" role="table" aria-label="Team members">
          <div className={MEMBER_GRID_CLASS} role="row">
            <span className={MEMBER_HEADER_CLASS} role="columnheader">
              Name
            </span>
            <span className={MEMBER_HEADER_CLASS} role="columnheader">
              Job title
            </span>
            <span className={MEMBER_HEADER_CLASS} role="columnheader">
              Email
            </span>
            <span className={MEMBER_HEADER_CLASS} role="columnheader">
              Role
            </span>
            <span className="sr-only" role="columnheader">
              Actions
            </span>
          </div>
          {members.map((member, index) => (
            <MemberRow
              key={member.userId}
              member={member}
              stripeIndex={index}
              expanded={selectedUserId === member.userId}
              onToggle={() => setSelectedUserId((id) => (id === member.userId ? null : member.userId))}
            />
          ))}
        </div>
      )}

      {selectedMember ? (
        <TeamMemberProfilePanel
          member={selectedMember}
          onClose={() => setSelectedUserId(null)}
          onSaved={() => void refreshMembers()}
        />
      ) : null}
    </div>
  );
}

function MemberRow({
  member,
  stripeIndex,
  expanded,
  onToggle,
}: {
  member: TeamMember;
  stripeIndex: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const name = member.displayName || member.email;
  const jobTitle = member.jobTitle || "No job title";

  return (
    <div
      className={cn(MEMBER_GRID_CLASS, "min-h-12 py-1", stripeIndex % 2 === 0 ? "bg-black" : "bg-black")}
      role="row"
    >
      <p className="min-w-0 break-words text-base text-white" role="cell">
        {name}
      </p>
      <p className="min-w-0 break-words text-base text-white" role="cell">
        {jobTitle}
      </p>
      <p className="min-w-0 break-words text-base text-white" role="cell">
        {member.email}
      </p>
      <p className="min-w-0 break-words text-base capitalize text-white" role="cell">
        {member.accessRole}
      </p>
      <Button
        type="button"
        onClick={onToggle}
        role="cell"
      >
        {expanded ? "Close profile" : "View profile"}
      </Button>
    </div>
  );
}
