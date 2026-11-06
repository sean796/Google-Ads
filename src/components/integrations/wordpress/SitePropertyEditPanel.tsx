import React, { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { SavePropertyButton } from "./SavePropertyButton";
import type { WordPressSite } from "../types";
import { fetchWordPressSitesMirror } from "../storage";
import { wordPressSiteHostKey } from "@/lib/wordpress-site-host-key";
import { SitePropertyFormFields, type SitePropertyFormFieldsProps } from "./SitePropertyFormFields";
import { WP_PANEL_SECTION_SHELL } from "./wordpress-panel-chrome";
import type { PropertySettingsSubSectionId } from "./property-settings-types";

export type SitePropertyEditPanelProps = SitePropertyFormFieldsProps & {
  site: WordPressSite;
  editingSite: WordPressSite | null;
  onSave: () => void;
  hideSave?: boolean;
  settingsSubSectionId?: PropertySettingsSubSectionId;
};

function findServerRow(site: WordPressSite, rows: WordPressSite[]): WordPressSite | undefined {
  const byId = rows.find((row) => row.id === site.id);
  if (byId) return byId;
  const host = wordPressSiteHostKey(site.siteUrl);
  if (!host) return undefined;
  return rows.find((row) => wordPressSiteHostKey(row.siteUrl) === host);
}

export const SitePropertyEditPanel: React.FC<SitePropertyEditPanelProps> = ({
  site,
  editingSite,
  onSave,
  hideSave = false,
  settingsSubSectionId,
  layout,
  formGbpLocationId,
  formGa4PropertyId,
  formGoogleAdsCustomerId,
  onFormGbpLocationIdChange,
  onFormGa4PropertyIdChange,
  onFormGoogleAdsCustomerIdChange,
  onPatchSite,
  ...formProps
}) => {
  const formReady = editingSite?.id === site.id;
  const hydrateKeyRef = useRef<string | null>(null);
  const isModalFlat = layout === "modalFlat";

  useEffect(() => {
    if (!formReady) {
      hydrateKeyRef.current = null;
      return;
    }
    if (hydrateKeyRef.current === site.id) return;

    let cancelled = false;
    void (async () => {
      const rows = await fetchWordPressSitesMirror();
      if (cancelled) return;
      hydrateKeyRef.current = site.id;
      if (rows.length === 0) return;

      const row = findServerRow(site, rows);
      if (!row) return;

      const gbp = row.gbpLocationId?.trim() ?? "";
      const ga4 = row.ga4PropertyId?.trim() ?? "";
      const ads = row.googleAdsCustomerId?.trim() ?? "";

      if (gbp && site.gbpLocationId?.trim() !== gbp) {
        onPatchSite?.(site.id, { gbpLocationId: gbp });
        if (formGbpLocationId.trim() !== gbp) {
          onFormGbpLocationIdChange(gbp);
        }
      }
      if (ga4 && site.ga4PropertyId?.trim() !== ga4) {
        onPatchSite?.(site.id, { ga4PropertyId: ga4 });
        if (formGa4PropertyId.trim() !== ga4) {
          onFormGa4PropertyIdChange(ga4);
        }
      }
      if (ads) {
        const adsId = ads.replace(/\D/g, "");
        const siteAdsId = (site.googleAdsCustomerId ?? "").replace(/\D/g, "");
        if (siteAdsId !== adsId) {
          onPatchSite?.(site.id, { googleAdsCustomerId: adsId || ads });
        }
        if (formGoogleAdsCustomerId.replace(/\D/g, "") !== adsId) {
          onFormGoogleAdsCustomerIdChange(adsId || ads);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [formReady, site, formGbpLocationId, formGa4PropertyId, formGoogleAdsCustomerId, onFormGbpLocationIdChange, onFormGa4PropertyIdChange, onFormGoogleAdsCustomerIdChange, onPatchSite]);

  return (
    <div
      className={cn(
        !isModalFlat && WP_PANEL_SECTION_SHELL,
        "flex w-full min-w-0 shrink-0 flex-col",
        isModalFlat ? "gap-1" : "gap-3",
      )}
    >
      {!formReady ? (
        <p className="shrink-0 text-base text-muted-foreground">Loading form…</p>
      ) : (
        <div className={cn("flex shrink-0 flex-col", isModalFlat ? "gap-1" : "gap-3")}>
          <SitePropertyFormFields
            {...formProps}
            layout={layout}
            settingsSubSectionId={settingsSubSectionId}
            formGbpLocationId={formGbpLocationId}
            formGa4PropertyId={formGa4PropertyId}
            formGoogleAdsCustomerId={formGoogleAdsCustomerId}
            onFormGbpLocationIdChange={onFormGbpLocationIdChange}
            onFormGa4PropertyIdChange={onFormGa4PropertyIdChange}
            onFormGoogleAdsCustomerIdChange={onFormGoogleAdsCustomerIdChange}
            onPatchSite={onPatchSite}
            chrome={isModalFlat ? "dark" : "light"}
            className="py-0"
          />
          {!hideSave ? (
            <div className="shrink-0 border-t border-border/60 pt-3">
              <SavePropertyButton onClick={onSave} />
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
};
