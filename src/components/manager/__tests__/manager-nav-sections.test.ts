import { describe, expect, it } from "vitest";
import {
  MANAGER_NAV_SECTIONS,
  getManagerNavSections,
  isManagerNavItemActive,
  isManagerNavItemSelected,
  type ManagerNavItem,
} from "@/components/manager/manager-nav-sections";

function allItems(): ManagerNavItem[] {
  const out: ManagerNavItem[] = [];
  const walk = (items: ManagerNavItem[]) => {
    for (const item of items) {
      out.push(item);
      if (item.children) walk(item.children);
    }
  };
  for (const section of MANAGER_NAV_SECTIONS) walk(section.items);
  return out;
}

describe("manager nav sections", () => {
  it("exposes labeled sections with items", () => {
    const sections = getManagerNavSections();
    expect(sections).toBe(MANAGER_NAV_SECTIONS);
    expect(sections.length).toBeGreaterThan(0);
    for (const section of sections) {
      expect(section.label.length).toBeGreaterThan(0);
      expect(section.items.length).toBeGreaterThan(0);
    }
  });

  it("selects a dashboard item only on the dashboard tab with its cluster", () => {
    const item = allItems().find((i) => i.dashboardCluster === "properties");
    expect(item).toBeDefined();
    expect(isManagerNavItemSelected("dashboard", item!, "properties")).toBe(true);
    expect(isManagerNavItemSelected("dashboard", item!, "api-keys")).toBe(false);
    expect(isManagerNavItemSelected("chat", item!, "properties")).toBe(false);
  });

  it("selects a generator item only on the generator tab with its section", () => {
    const item = allItems().find((i) => i.generatorSection);
    expect(item).toBeDefined();
    expect(isManagerNavItemSelected("generator", item!, undefined, item!.generatorSection)).toBe(true);
    expect(isManagerNavItemSelected("generator", item!, undefined, "bulk-csv" as never)).toBe(false);
    expect(isManagerNavItemSelected("chat", item!, undefined, item!.generatorSection)).toBe(false);
  });

  it("selects a plain item when the tab matches its value", () => {
    const item = allItems().find(
      (i) => !i.dashboardCluster && !i.generatorSection && !i.organicDashboard && !i.children && !i.docsPath,
    );
    expect(item).toBeDefined();
    expect(isManagerNavItemSelected(item!.value, item!, undefined)).toBe(true);
    expect(isManagerNavItemSelected("dashboard", item!, undefined)).toBe(item!.value === "dashboard");
  });

  it("marks a parent active when any child is active", () => {
    const parent = allItems().find((i) => i.children?.length);
    expect(parent).toBeDefined();
    const child = parent!.children![0]!;
    const childActive = isManagerNavItemSelected("x", child, undefined);
    expect(isManagerNavItemActive("x", parent!, undefined)).toBe(
      parent!.children!.some((c) => isManagerNavItemActive("x", c, undefined)),
    );
    expect(typeof childActive).toBe("boolean");
  });

  it("selects the organic item on its tab or a site organic path", () => {
    const item = allItems().find((i) => i.organicDashboard);
    expect(item).toBeDefined();
    expect(isManagerNavItemSelected("organic-reporting", item!, undefined)).toBe(true);
    expect(isManagerNavItemSelected("dashboard", item!, undefined, undefined, "/sites/abc/organic")).toBe(true);
    expect(isManagerNavItemSelected("dashboard", item!, undefined, undefined, "/sites/abc")).toBe(false);
  });
});
