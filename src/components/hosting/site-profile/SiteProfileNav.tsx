import { SITE_PROFILE_SECTIONS, SITE_PROFILE_SECTION_LABEL, type SiteProfileSection } from "@/lib/hosting/pulse-host-route";
import { PROFILE_NAV, PROFILE_NAV_BTN } from "./site-profile-theme";
import { Button } from "@/ui";

export type SiteProfileNavProps = {
  active: SiteProfileSection;
  onChange: (section: SiteProfileSection) => void;
};

export function SiteProfileNav({ active, onChange }: SiteProfileNavProps) {
  return (
    <nav className={PROFILE_NAV} aria-label="Site sections">
      {SITE_PROFILE_SECTIONS.map((section) => (
        <Button variant="quiet" key={section} data-active={section === active} onClick={() => onChange(section)}>
          {SITE_PROFILE_SECTION_LABEL[section]}
        </Button>
      ))}
    </nav>
  );
}
