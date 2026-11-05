import { GoogleAnalyticsSettingsContent } from "@/components/GoogleAnalyticsSettingsContent";
import { GSCSettingsConnectionSection } from "@/components/integrations/GSCFeature";
import { GMBSettingsContent } from "@/components/GMBSettingsContent";
import { GoogleDriveSettingsContent } from "@/components/GoogleDriveSettingsContent";
import { GoogleAdsSettingsContent } from "@/components/manager/GoogleAdsSettingsContent";
import {
  DASHBOARD_SETTINGS_GROUP_CLASS,
  DASHBOARD_SETTINGS_PANEL_CLASS,
} from "@/components/manager/dashboard/dashboard-panel-styles";
import { Globe } from "lucide-react";

const jumpLink =
  "block rounded-lg border border-white/[0.08] bg-ui-field/50 p-3 text-white transition-colors hover:bg-ui-field/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/35";

export function GoogleServicesSettingsContent() {
  return (
    <div className={`${DASHBOARD_SETTINGS_PANEL_CLASS} space-y-4`} aria-labelledby="google-services-heading">
      <div className="flex items-center gap-2">
        <Globe className="h-5 w-5 text-white" aria-hidden />
        <h2 id="google-services-heading" className="text-base font-semibold text-white">
          Google Services
        </h2>
      </div>

      <div className={DASHBOARD_SETTINGS_GROUP_CLASS}>
        <p className="font-semibold text-white">Start here</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <a href="#gsc" className={jumpLink}>
            <span className="font-semibold">Search Console</span>
            <p className="mt-1 text-white">Service account JSON. Copy the API email, then test.</p>
          </a>
          <a href="#ga4" className={jumpLink}>
            <span className="font-semibold">Analytics 4</span>
            <p className="mt-1 text-white">Upload JSON once. Set Property ID per site in Properties.</p>
          </a>
          <a href="#gbp" className={jumpLink}>
            <span className="font-semibold">Business Profile</span>
            <p className="mt-1 text-white">OAuth only. Connect here, then test connection.</p>
          </a>
          <a href="#drive" className={jumpLink}>
            <span className="font-semibold">Google Drive</span>
            <p className="mt-1 text-white">Connect Google Drive for Doc exports and share links.</p>
          </a>
          <a href="#ads" className={jumpLink}>
            <span className="font-semibold">Google Ads</span>
            <p className="mt-1 text-white">MCC ID, then Connect with the same Cloud OAuth client as Drive and Business Profile.</p>
          </a>
        </div>
      </div>

      <section id="gsc" aria-labelledby="gsc-heading" className={`${DASHBOARD_SETTINGS_GROUP_CLASS} scroll-mt-4`}>
        <GSCSettingsConnectionSection />
      </section>
      <section id="ga4" aria-labelledby="ga4-heading" className={`${DASHBOARD_SETTINGS_GROUP_CLASS} scroll-mt-4`}>
        <GoogleAnalyticsSettingsContent />
      </section>
      <section id="gbp" aria-labelledby="gbp-heading" className={`${DASHBOARD_SETTINGS_GROUP_CLASS} scroll-mt-4`}>
        <GMBSettingsContent />
      </section>
      <section id="drive" aria-labelledby="drive-heading" className={`${DASHBOARD_SETTINGS_GROUP_CLASS} scroll-mt-4`}>
        <GoogleDriveSettingsContent />
      </section>
      <section id="ads" aria-labelledby="ads-heading" className={`${DASHBOARD_SETTINGS_GROUP_CLASS} scroll-mt-4`}>
        <GoogleAdsSettingsContent />
      </section>
    </div>
  );
}
