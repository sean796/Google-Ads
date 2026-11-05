import type { MySitesTab } from "./my-sites-view-model";
import {
  MY_SITES_ATTENTION_BADGE,
  MY_SITES_COUNT_BADGE,
  MY_SITES_TAB_BTN,
  MY_SITES_TABS_BAND,
  MY_SITES_UPDATES_BADGE,
} from "./my-sites-theme";
import { Button } from "@/ui";

export type MySitesTabsProps = {
  active: MySitesTab;
  counts: { all: number; attention: number; updates: number };
  onChange: (tab: MySitesTab) => void;
};

const TABS: Array<{ id: MySitesTab; label: string }> = [
  { id: "all", label: "All sites" },
  { id: "attention", label: "Needs attention" },
  { id: "updates", label: "Needs updates" },
  { id: "plugins", label: "Plugins" },
  { id: "themes", label: "Themes" },
];

function badgeFor(tab: MySitesTab, counts: MySitesTabsProps["counts"]) {
  if (tab === "all") return <span className={MY_SITES_COUNT_BADGE}>{counts.all}</span>;
  if (tab === "attention") {
    return <span className={counts.attention ? MY_SITES_ATTENTION_BADGE : MY_SITES_COUNT_BADGE}>{counts.attention}</span>;
  }
  if (tab === "updates") {
    return <span className={counts.updates ? MY_SITES_UPDATES_BADGE : MY_SITES_COUNT_BADGE}>{counts.updates}</span>;
  }
  return null;
}

export function MySitesTabs({ active, counts, onChange }: MySitesTabsProps) {
  return (
    <div role="tablist" className={MY_SITES_TABS_BAND}>
      {TABS.map((tab) => (
        <Button
          variant="quiet"
          key={tab.id}
          role="tab"
          aria-selected={active === tab.id}
          data-active={active === tab.id}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
          {badgeFor(tab.id, counts)}
        </Button>
      ))}
    </div>
  );
}
