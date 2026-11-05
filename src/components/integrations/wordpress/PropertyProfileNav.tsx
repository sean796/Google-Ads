import { PROFILE_NAV, PROFILE_NAV_BTN } from "@/components/hosting/site-profile/site-profile-theme";
import { cn } from "@/lib/utils";
import { PROPERTY_SETTINGS_SUB_SECTIONS, type PropertySettingsSubSectionId } from "./property-settings-types";
import type { WordPressSiteAdminSectionId } from "./WordPressSiteAdminLayout";
import { Button } from "@/ui";

export type PropertyProfileNavProps = {
  sections: { id: WordPressSiteAdminSectionId; label: string }[];
  activeSectionId: WordPressSiteAdminSectionId;
  settingsSubSectionId: PropertySettingsSubSectionId;
  onSectionChange: (id: WordPressSiteAdminSectionId) => void;
  onSettingsSubSectionChange: (id: PropertySettingsSubSectionId) => void;
};

export function PropertyProfileNav({ sections, activeSectionId, settingsSubSectionId, onSectionChange, onSettingsSubSectionChange }: PropertyProfileNavProps) {
  return (
    <nav className={PROFILE_NAV} aria-label="Property sections">
      {sections.map((section) => (
        <Button variant="quiet" key={section.id} data-active={section.id === activeSectionId} onClick={() => onSectionChange(section.id)}>
          {section.label}
        </Button>
      ))}
      {activeSectionId === "site-settings"
        ? PROPERTY_SETTINGS_SUB_SECTIONS.map((sub) => (
            <Button
              variant="quiet"
              key={sub.id}
              data-active={sub.id === settingsSubSectionId}
              onClick={() => onSettingsSubSectionChange(sub.id)}
            >
              {sub.label}
            </Button>
          ))
        : null}
    </nav>
  );
}
