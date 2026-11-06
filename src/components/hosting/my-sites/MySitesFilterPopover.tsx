
import type { HostedEnvironmentKind, HostedSiteStatus, HostedTag } from "@/lib/hosting-api";
import { EMPTY_FILTERS, ENVIRONMENT_LABEL, type MySitesFilters } from "./my-sites-view-model";
import { Button, Checkbox } from "@/ui";

export type MySitesFilterPopoverProps = {
  filters: MySitesFilters;
  onChange: (next: MySitesFilters) => void;
  tags: HostedTag[];
  phpVersions: string[];
};

const ENVIRONMENTS: HostedEnvironmentKind[] = ["production", "staging", "development"];
const STATUSES: HostedSiteStatus[] = ["active", "provisioning", "degraded", "failed", "pending"];

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function Section<T extends string | number>({
  title,
  options,
  selected,
  labelFor,
  onToggle,
}: {
  title: string;
  options: T[];
  selected: T[];
  labelFor: (v: T) => string;
  onToggle: (v: T) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="font-semibold text-white">{title}</p>
      {options.length === 0 ? (
        <p className="text-muted-foreground">None</p>
      ) : (
        options.map((opt) => (
          <label key={String(opt)} className="flex h-6 cursor-pointer items-center gap-2">
            <Checkbox checked={selected.includes(opt)} onCheckedChange={() => onToggle(opt)} />
            <span>{labelFor(opt)}</span>
          </label>
        ))
      )}
    </div>
  );
}

export function MySitesFilterPopover({ filters, onChange, tags, phpVersions }: MySitesFilterPopoverProps) {
  return (
    <div className="flex flex-col gap-4">
      <Section
        title="Environment"
        options={ENVIRONMENTS}
        selected={filters.environments}
        labelFor={(v) => ENVIRONMENT_LABEL[v]}
        onToggle={(v) => onChange({ ...filters, environments: toggle(filters.environments, v) })}
      />
      <Section
        title="Status"
        options={STATUSES}
        selected={filters.statuses}
        labelFor={(v) => v.charAt(0).toUpperCase() + v.slice(1)}
        onToggle={(v) => onChange({ ...filters, statuses: toggle(filters.statuses, v) })}
      />
      <Section
        title="Tags"
        options={tags.map((t) => t.id)}
        selected={filters.tagIds}
        labelFor={(id) => tags.find((t) => t.id === id)?.name ?? String(id)}
        onToggle={(id) => onChange({ ...filters, tagIds: toggle(filters.tagIds, id) })}
      />
      <Section
        title="PHP"
        options={phpVersions}
        selected={filters.phpVersions}
        labelFor={(v) => v}
        onToggle={(v) => onChange({ ...filters, phpVersions: toggle(filters.phpVersions, v) })}
      />
      <Button
        variant="quiet"
        type="button"
        onClick={() => onChange({ ...EMPTY_FILTERS, query: filters.query })}
      >
        Clear filters
      </Button>
    </div>
  );
}
