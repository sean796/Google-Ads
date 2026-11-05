/**
 * Distance reference + "Found on site" discovery for entity generation (SAP find tab + full dialog).
 */

import React, { useEffect, useMemo, useState } from "react";
import { ExternalLink } from "lucide-react";
import type { WordPressSite } from "../../types";
import { getPrimaryCityStateLabel, getPrimaryLocationLabel } from "@/lib/primary-location-from-site";
import {
  fetchLocationDiscovery,
  fetchEnrichLocationPageAddresses,
  type LocationDiscoveryResult,
  type EnrichedLocationPagePath,
} from "@/lib/fetch-location-discovery";
import type { ServiceAreaOrigin } from "@/lib/entity/radius-filter";
import { loadApiKey } from "@/lib/api";
import { getResearchModel } from "@/lib/optimization-settings-storage";
import {
  buildUniqueSiteLocations,
  normalizeStreetLocationKey,
  resolveRadiusDisplayLine,
  type UniqueSiteLocation,
} from "@/lib/location-address-dedupe";
import { Field, SelectField } from "@/ui";

const CUSTOM_RADIUS = "__custom__";
const INTEGRATIONS_RADIUS = "__integrations__";

export interface EntityDistanceDiscoverySectionProps {
  pendingEntitySite: WordPressSite | null;
  pendingEntitySitemap: string | null;
  serviceAreaOrigin?: ServiceAreaOrigin;
  setDistanceOriginLabel?: (label: string | null) => void;
}

export const EntityDistanceDiscoverySection: React.FC<EntityDistanceDiscoverySectionProps> = ({
  pendingEntitySite,
  pendingEntitySitemap,
  serviceAreaOrigin,
  setDistanceOriginLabel,
}) => {
  const [discovery, setDiscovery] = useState<LocationDiscoveryResult | null>(null);
  const [locationLabelLoading, setLocationLabelLoading] = useState(false);
  const [enrichingAddresses, setEnrichingAddresses] = useState(false);
  const [enrichedPages, setEnrichedPages] = useState<EnrichedLocationPagePath[]>([]);
  const [radiusChoice, setRadiusChoice] = useState<string>(INTEGRATIONS_RADIUS);
  const [manualRadiusAddress, setManualRadiusAddress] = useState("");
  const [uniqueLocations, setUniqueLocations] = useState<UniqueSiteLocation[]>([]);
  const [dedupingLocations, setDedupingLocations] = useState(false);
  const [napKey, setNapKey] = useState<string | null>(null);
  const [primaryKey, setPrimaryKey] = useState<string | null>(null);

  const pagesWithAddress = useMemo(
    () => enrichedPages.filter((e) => e.address && e.address.trim().length > 0),
    [enrichedPages]
  );

  const napLabel = pendingEntitySite ? getPrimaryLocationLabel(pendingEntitySite) : null;
  const cityStateLabel = pendingEntitySite ? getPrimaryCityStateLabel(pendingEntitySite) ?? null : null;
  const areaFromDiscovery = discovery?.primaryAreaLabel?.trim() || null;

  useEffect(() => {
    if (!pendingEntitySite?.siteUrl) {
      setUniqueLocations([]);
      setDedupingLocations(false);
      return;
    }
    let cancelled = false;
    setDedupingLocations(true);
    buildUniqueSiteLocations(
      discovery?.addresses ?? [],
      pagesWithAddress,
      discovery?.primarySuggestion ? [discovery.primarySuggestion] : undefined,
      pendingEntitySite.id
    )
      .then((ul) => {
        if (!cancelled) {
          setUniqueLocations(ul);
          setDedupingLocations(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setUniqueLocations([]);
          setDedupingLocations(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [
    discovery?.addresses,
    discovery?.primarySuggestion,
    pagesWithAddress,
    pendingEntitySite?.id,
    pendingEntitySite?.siteUrl,
  ]);

  useEffect(() => {
    if (!napLabel?.trim()) {
      setNapKey(null);
      return;
    }
    let cancelled = false;
    normalizeStreetLocationKey(napLabel, pendingEntitySite?.id).then((k) => {
      if (!cancelled) setNapKey(k);
    });
    return () => {
      cancelled = true;
    };
  }, [napLabel, pendingEntitySite?.id]);

  useEffect(() => {
    const ps = discovery?.primarySuggestion?.trim();
    if (!ps || !pendingEntitySite) {
      setPrimaryKey(null);
      return;
    }
    let cancelled = false;
    normalizeStreetLocationKey(ps, pendingEntitySite.id).then((k) => {
      if (!cancelled) setPrimaryKey(k);
    });
    return () => {
      cancelled = true;
    };
  }, [discovery?.primarySuggestion, pendingEntitySite?.id]);

  const displayLocations = useMemo(() => {
    const n = napLabel?.trim() || null;
    const count = uniqueLocations.length;
    return uniqueLocations.map((u) => ({
      ...u,
      displayAddress: resolveRadiusDisplayLine(
        u.displayAddress,
        n,
        areaFromDiscovery,
        cityStateLabel,
        napKey,
        u.key,
        count
      ),
    }));
  }, [uniqueLocations, napLabel, areaFromDiscovery, cityStateLabel, napKey]);

  useEffect(() => {
    if (!pendingEntitySite?.siteUrl) {
      setDiscovery(null);
      setEnrichedPages([]);
      setRadiusChoice(INTEGRATIONS_RADIUS);
      return;
    }
    let cancelled = false;
    setManualRadiusAddress("");
    setEnrichedPages([]);
    setLocationLabelLoading(true);
    setEnrichingAddresses(false);

    fetchLocationDiscovery(pendingEntitySite.siteUrl, {
      entitySitemapUrl:
        pendingEntitySitemap?.trim() || pendingEntitySite.entitySitemapUrl?.trim() || undefined,
    })
      .then(async (disc) => {
        if (cancelled) return;
        setDiscovery(disc);
        const nap = getPrimaryLocationLabel(pendingEntitySite);
        const jsonLdFirst = disc.primarySuggestion;
        const first = jsonLdFirst || nap;
        if (first) {
          setRadiusChoice(await normalizeStreetLocationKey(first, pendingEntitySite.id));
          setDistanceOriginLabel?.(first);
        } else {
          setRadiusChoice(nap ? INTEGRATIONS_RADIUS : CUSTOM_RADIUS);
          setDistanceOriginLabel?.(nap || null);
        }

        const apiKey = loadApiKey()?.trim();
        if (!disc.pagePaths?.length || !apiKey) {
          if (!cancelled) setLocationLabelLoading(false);
          return;
        }

        if (!cancelled) setLocationLabelLoading(false);
        setEnrichingAddresses(true);
        try {
          const model = getResearchModel(pendingEntitySite.id);
          const enriched = await fetchEnrichLocationPageAddresses(
            pendingEntitySite.siteUrl,
            disc.pagePaths,
            { apiKey, model }
          );
          if (cancelled) return;
          setEnrichedPages(enriched);

          const withAddr = enriched.filter((e) => e.address && e.address.trim());
          const hadStaticFirst = !!(jsonLdFirst || nap);
          if (withAddr.length > 0 && !hadStaticFirst) {
            const top = withAddr[0];
            setRadiusChoice(await normalizeStreetLocationKey(top.address!, pendingEntitySite.id));
            setDistanceOriginLabel?.(top.address!);
          }
        } finally {
          if (!cancelled) setEnrichingAddresses(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLocationLabelLoading(false);
          setEnrichingAddresses(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    pendingEntitySite?.id,
    pendingEntitySite?.siteUrl,
    pendingEntitySite?.entitySitemapUrl,
    pendingEntitySite?.locations,
    pendingEntitySite?.napInfo,
    pendingEntitySitemap,
    setDistanceOriginLabel,
  ]);

  useEffect(() => {
    if (!setDistanceOriginLabel || !pendingEntitySite) return;
    if (radiusChoice === CUSTOM_RADIUS) {
      setDistanceOriginLabel(manualRadiusAddress.trim() || null);
      return;
    }
    if (radiusChoice === INTEGRATIONS_RADIUS) {
      setDistanceOriginLabel(getPrimaryLocationLabel(pendingEntitySite) || null);
      return;
    }
    const loc = displayLocations.find((u) => u.key === radiusChoice);
    if (loc) {
      setDistanceOriginLabel(loc.displayAddress);
      return;
    }
    if (discovery?.primarySuggestion && primaryKey === radiusChoice) {
      setDistanceOriginLabel(discovery.primarySuggestion);
      return;
    }
    setDistanceOriginLabel(radiusChoice);
  }, [
    radiusChoice,
    manualRadiusAddress,
    pendingEntitySite,
    setDistanceOriginLabel,
    displayLocations,
    discovery?.primarySuggestion,
    primaryKey,
  ]);

  const showIntegrationsOption = useMemo(() => {
    if (!napLabel?.trim()) return false;
    if (napKey === null) return false;
    if (uniqueLocations.some((u) => u.key === napKey)) return false;
    if (uniqueLocations.length === 1) {
      const merged = resolveRadiusDisplayLine(
        uniqueLocations[0].displayAddress,
        napLabel,
        areaFromDiscovery,
        cityStateLabel,
        napKey,
        uniqueLocations[0].key,
        1
      );
      if (merged.trim() === napLabel.trim()) return false;
    }
    return true;
  }, [napLabel, napKey, uniqueLocations, areaFromDiscovery, cityStateLabel]);

  useEffect(() => {
    if (locationLabelLoading || enrichingAddresses || dedupingLocations) return;
    const valid = new Set<string>([
      ...uniqueLocations.map((u) => u.key),
      ...(showIntegrationsOption ? [INTEGRATIONS_RADIUS] : []),
      CUSTOM_RADIUS,
    ]);
    if (valid.has(radiusChoice)) return;
    if (radiusChoice === CUSTOM_RADIUS || radiusChoice === INTEGRATIONS_RADIUS) return;
    let cancelled = false;
    normalizeStreetLocationKey(radiusChoice, pendingEntitySite?.id).then((nk) => {
      if (cancelled) return;
      if (uniqueLocations.some((u) => u.key === nk)) {
        setRadiusChoice(nk);
        return;
      }
      const byHref = uniqueLocations.find((u) => u.hrefs.includes(radiusChoice));
      if (byHref) {
        setRadiusChoice(byHref.key);
        return;
      }
      const byLabel = uniqueLocations.find((u) => u.displayAddress === radiusChoice);
      if (byLabel) {
        setRadiusChoice(byLabel.key);
        return;
      }
      if (uniqueLocations[0]) setRadiusChoice(uniqueLocations[0].key);
      else if (showIntegrationsOption) setRadiusChoice(INTEGRATIONS_RADIUS);
      else setRadiusChoice(CUSTOM_RADIUS);
    });
    return () => {
      cancelled = true;
    };
  }, [
    locationLabelLoading,
    enrichingAddresses,
    dedupingLocations,
    uniqueLocations,
    showIntegrationsOption,
    radiusChoice,
    pendingEntitySite?.id,
  ]);

  const displayRadiusLabel = useMemo(() => {
    if (radiusChoice === CUSTOM_RADIUS) return manualRadiusAddress.trim() || null;
    if (radiusChoice === INTEGRATIONS_RADIUS) return napLabel;
    const loc = displayLocations.find((u) => u.key === radiusChoice);
    if (loc) return loc.displayAddress;
    if (discovery?.primarySuggestion && primaryKey === radiusChoice) {
      return discovery.primarySuggestion;
    }
    return radiusChoice;
  }, [
    radiusChoice,
    manualRadiusAddress,
    napLabel,
    displayLocations,
    discovery?.primarySuggestion,
    primaryKey,
  ]);

  const apiKeyPresent = Boolean(loadApiKey()?.trim());
  const rawPageCount = discovery?.pagePaths?.length ?? 0;
  const showFoundOnSiteBlock =
    !!discovery &&
    (uniqueLocations.length > 0 ||
      enrichingAddresses ||
      (rawPageCount > 0 && !apiKeyPresent));

  if (!pendingEntitySite || !pendingEntitySitemap) return null;

  const showMultiLocationList = uniqueLocations.length > 1;
  /** Second block: API key hint and/or multiple storefronts - skip when nothing to add beyond the radius row. */
  const showFoundSecondary =
    showFoundOnSiteBlock &&
    ((rawPageCount > 0 && !apiKeyPresent) || (showMultiLocationList && !enrichingAddresses));

  return (
    <div className="mb-3 space-y-4">
      <section aria-labelledby="sap-radius-heading" className="space-y-3">
        <h3 id="sap-radius-heading" className="text-base font-semibold text-foreground">
          Radius reference
        </h3>
        {locationLabelLoading && !discovery ? (
          <p className="text-base text-muted-foreground flex items-center gap-2">
            
            Reading location data from the site…
          </p>
        ) : (
          <>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
              <label htmlFor="sap-radius-select" className="text-base text-muted-foreground shrink-0 sm:pt-2 sm:w-36">
                Address
              </label>
              <div className="min-w-0 flex-1 space-y-2">
                <SelectField
                  placeholder="Choose address"
                  value={radiusChoice}
                  onValueChange={(v) => setRadiusChoice(v)}
                  options={[
                    ...displayLocations.map((u) => ({ value: u.key, label: u.displayAddress.trim() })),
                    ...(showIntegrationsOption ? [{ value: INTEGRATIONS_RADIUS, label: `Integrations (NAP): ${napLabel}` }] : []),
                    { value: CUSTOM_RADIUS, label: "Custom" },
                  ]}
                  width="full"
                  disabled={enrichingAddresses || dedupingLocations}
                />
                {enrichingAddresses ? (
                  <p className="text-base text-muted-foreground flex items-center gap-2">
                    
                    Matching pages to street addresses…
                  </p>
                ) : null}
                {radiusChoice === CUSTOM_RADIUS && (
                  <div className="space-y-1">
                    <label className="text-base text-muted-foreground">Custom address</label>
                    <Field
                      value={manualRadiusAddress}
                      onChange={(e) => setManualRadiusAddress(e.target.value)}
                      placeholder="Street, city, region"
                    />
                  </div>
                )}
                {!displayRadiusLabel && !locationLabelLoading ? (
                  <p className="text-base text-muted-foreground">
                    No address detected yet - add LocalBusiness JSON-LD, save NAP in Integrations, or use Custom.
                  </p>
                ) : null}
              </div>
            </div>
          </>
        )}
      </section>

      {showFoundSecondary ? (
        <section className="space-y-3 border-t border-border/60 pt-4" aria-label="Additional location details">
          {rawPageCount > 0 && !apiKeyPresent ? (
            <p className="text-base text-muted-foreground">
              Add an OpenRouter API key in app settings to resolve street addresses from service-area pages.
            </p>
          ) : null}
          {showMultiLocationList ? (
            <>
              <h4 className="text-base font-semibold text-foreground">Other storefronts on this site</h4>
              <ul className="flex flex-col gap-2.5 list-none m-0 p-0">
                {displayLocations.map((loc) => (
                  <li
                    key={loc.key}
                    className="space-y-1 border-l-[3px] border-l-border/60 bg-black/25 px-3 py-2.5"
                  >
                    <p className="text-base text-foreground leading-snug">{loc.displayAddress}</p>
                    {loc.name ? (
                      <p className="text-base text-muted-foreground leading-snug">{loc.name}</p>
                    ) : null}
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-base text-muted-foreground">
                      {loc.hrefs.length > 1 ? (
                        <span>{loc.hrefs.length} pages share this address</span>
                      ) : loc.hrefs.length === 1 ? (
                        <a
                          href={loc.hrefs[0]}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-[hsl(var(--semantic-data-foreground))] hover:underline"
                        >
                          <ExternalLink className="h-4 w-4 shrink-0" />
                          Open page
                        </a>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </section>
      ) : null}

      {serviceAreaOrigin ? (
        <p className="border-t border-border/60 pt-3 text-base text-muted-foreground">
          <span className="text-foreground/90">Last run center: </span>
          {serviceAreaOrigin.label} ({serviceAreaOrigin.lat.toFixed(4)}, {serviceAreaOrigin.lng.toFixed(4)})
        </p>
      ) : null}
    </div>
  );
};
