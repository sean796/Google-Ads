import { useEffect, useState, type ReactElement } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button, Field, SelectField } from "@/ui";
import {
  inferServiceCountry,
  isServiceCountry,
  nextStateForCountry,
  normalizeServiceRegion,
  regionPlaceholder,
  SERVICE_COUNTRY_OPTIONS,
  serviceRegionOptions,
} from "@/lib/keyword-location-utils";
import { TaskFormFlatGrid, TaskFormPlaceholderCell } from "@/components/manager/tasks/TaskFormLayout";
import type { Location, WordPressSite } from "@/components/integrations/types";
import {
  buildSiteAdditionalLocationsPatch,
  readSiteAdditionalLocations,
} from "@/lib/wordpress-api/site-service-area";

const UNSET_SELECT_VALUE = "__unset__";

export function ProfileLocationSelect({
  placeholder,
  value,
  options,
  onChange,
  disabled = false,
}: {
  placeholder: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  disabled?: boolean;
}): ReactElement {
  const listed = options.includes(value) || !value ? options : [value, ...options];
  return (
    <SelectField
      placeholder={placeholder}
      width="full"
      value={value || UNSET_SELECT_VALUE}
      disabled={disabled}
      options={[{ value: UNSET_SELECT_VALUE, label: placeholder }, ...listed.map((opt) => ({ value: opt, label: opt }))]}
      onValueChange={(next) => onChange(next === UNSET_SELECT_VALUE ? "" : next)}
    />
  );
}
type DraftAdditionalLocation = {
  id: string;
  name?: string;
  address?: string;
  city: string;
  state: string;
  country: string;
  zip?: string;
  phone?: string;
  email?: string;
};

function toDraftAdditionalLocations(
  site?: WordPressSite | null,
  defaultCountry: string = "",
): DraftAdditionalLocation[] {
  return readSiteAdditionalLocations(site).map((loc: Location, idx: number) => {
    const country =
      (loc.country && isServiceCountry(loc.country) ? loc.country : "") ||
      inferServiceCountry(loc.state, defaultCountry);
    const state = normalizeServiceRegion(loc.state, country);
    return {
      id: loc.id || `loc-${site?.id ?? "site"}-extra-${idx + 1}`,
      name: loc.name,
      address: loc.address,
      city: loc.city ?? "",
      state,
      country,
      zip: loc.zip,
      phone: loc.phone,
      email: loc.email,
    };
  });
}

export function ProfileAdditionalLocationsEditor({
  site,
  defaultCountry,
  defaultState,
  onPatchSite,
  patchSiteId,
}: {
  site?: WordPressSite | null;
  defaultCountry: string;
  defaultState: string;
  onPatchSite?: (siteId: string, patch: Partial<WordPressSite>) => void;
  patchSiteId?: string | null;
}): ReactElement | null {
  const [rows, setRows] = useState<DraftAdditionalLocation[]>(() =>
    toDraftAdditionalLocations(site, defaultCountry),
  );

  const siteLocationsKey = JSON.stringify(
    readSiteAdditionalLocations(site).map((l) => [l.id, l.city, l.state, l.country]),
  );

  useEffect(() => {
    setRows(toDraftAdditionalLocations(site, defaultCountry));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [site?.id, siteLocationsKey]);

  const commitRows = (nextRows: DraftAdditionalLocation[]) => {
    if (!onPatchSite || !patchSiteId || !site) return;
    onPatchSite(patchSiteId, buildSiteAdditionalLocationsPatch(site, nextRows));
  };

  const handleAddLocation = () => {
    const country = isServiceCountry(defaultCountry) ? defaultCountry : "Canada";
    const state = nextStateForCountry(defaultState, country);
    const next: DraftAdditionalLocation[] = [
      ...rows,
      {
        id: `loc-${site?.id ?? "site"}-extra-${Date.now()}-${rows.length + 1}`,
        city: "",
        state,
        country,
      },
    ];
    setRows(next);
    commitRows(next);
  };

  const handleRemoveLocation = (index: number) => {
    const next = rows.filter((_, i) => i !== index);
    setRows(next);
    commitRows(next);
  };

  const handleCityChange = (index: number, city: string) => {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, city } : r)));
  };

  const handleCityBlur = () => {
    commitRows(rows);
  };

  const handleCountryChange = (index: number, country: string) => {
    const next = rows.map((r, i) => {
      if (i !== index) return r;
      const nextState = nextStateForCountry(r.state, country);
      return { ...r, country, state: nextState };
    });
    setRows(next);
    commitRows(next);
  };

  const handleStateChange = (index: number, state: string) => {
    const next = rows.map((r, i) => (i === index ? { ...r, state } : r));
    setRows(next);
    commitRows(next);
  };

  return (
    <div className="mt-2 flex flex-col gap-2">
      {rows.map((row, idx) => (
        <TaskFormFlatGrid key={row.id} className="grid-cols-1 sm:grid-cols-[1fr_1fr_1fr_auto]">
          <TaskFormPlaceholderCell>
            <Field
              value={row.city}
              onChange={(e) => handleCityChange(idx, e.target.value)}
              onBlur={handleCityBlur}
              placeholder={`Additional city ${idx + 1}`}
              aria-label={`Additional city ${idx + 1}`}
              autoComplete="off"
            />
          </TaskFormPlaceholderCell>
          <TaskFormPlaceholderCell>
            <ProfileLocationSelect
              placeholder="Country"
              value={row.country}
              options={SERVICE_COUNTRY_OPTIONS}
              onChange={(val) => handleCountryChange(idx, val)}
            />
          </TaskFormPlaceholderCell>
          <TaskFormPlaceholderCell>
            <ProfileLocationSelect
              placeholder={regionPlaceholder(row.country)}
              value={row.state}
              options={serviceRegionOptions(row.country)}
              onChange={(val) => handleStateChange(idx, val)}
              disabled={!row.country}
            />
          </TaskFormPlaceholderCell>
          <Button icon={Trash2} onClick={() => handleRemoveLocation(idx)}>
            Remove
          </Button>        </TaskFormFlatGrid>
      ))}
      <div className="flex items-center">
        <Button icon={Plus} onClick={handleAddLocation} disabled={!site || !patchSiteId}>
          Add location
        </Button>
      </div>
    </div>
  );
}