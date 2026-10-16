import type { LucideIcon } from "lucide-react";
import {
  Building2,
  Clapperboard,
  Cpu,
  Film,
  UserRound,
  Users,
  Cloud,
  Crosshair,
  GitMerge,
  Key,
  LayoutDashboard,
  Layers,
  LifeBuoy,
  Megaphone,
  MessageCircle,
  CheckSquare,
  Share2,
  ScrollText,
  Search,
  Sparkles,
  Server,
  Target,
  TrendingUp,
  LineChart,
  Wrench,
  Zap,
} from "lucide-react";
import type { ManagerSettingsClusterId } from "@/components/manager/manager-settings-cluster";

export type ManagerNavItem = {
  /** Stable key when multiple items share the same `value` (e.g. Generator sections). */
  id?: string;
  value: string;
  label: string;
  description: string;
  icon: LucideIcon;
  /** Nested mega menu rows (parent is a submenu trigger only). */
  children?: ManagerNavItem[];
  /** Selects Dashboard tab and this settings section (in-page nav hidden). */
  dashboardCluster?: ManagerSettingsClusterId;
  /** Opens a React Router path outside manager tabs (e.g. /docs). */
  docsPath?: string;
  /** Opens the property-scoped organic dashboard for the active (or first) site. */
  organicDashboard?: boolean;
};

export type ManagerNavSection = {
  id: string;
  label: string;
  /** Shown on the top nav trigger (neon semantic green when section is active). */
  icon: LucideIcon;
  items: ManagerNavItem[];
};

export const MANAGER_NAV_SECTIONS: ManagerNavSection[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    items: [
      {
        value: "dashboard-properties",
        label: "Properties",
        description: "WordPress sites and integrations",
        icon: Building2,
        dashboardCluster: "properties",
      },
      {
        value: "dashboard-api-keys",
        label: "API Keys",
        description: "OpenRouter and DataForSEO",
        icon: Key,
        dashboardCluster: "api-keys",
      },
      {
        value: "dashboard-master-rules",
        label: "Master Rules",
        description: "Per-site client instructions stored in the workspace for AI generation.",
        icon: ScrollText,
        dashboardCluster: "master-rules",
      },
      {
        value: "dashboard-ai-generation",
        label: "AI & Models",
        description: "Default model and generation parameters",
        icon: Sparkles,
        dashboardCluster: "ai-generation",
      },
      {
        value: "dashboard-google",
        label: "Google Services",
        description: "Analytics and Search Console",
        icon: Cloud,
        dashboardCluster: "google",
      },
      {
        value: "pulse-host",
        label: "Pulse Host",
        description: "Managed WordPress sites",
        icon: Server,
      },
      {
        value: "neo-emcp",
        label: "Neo EMCP",
        description: "WordPress Abilities API, Elementor MCP tools, and 8-point schema doctor",
        icon: Cpu,
      },
    ],
  },
  {
    id: "reporting",
    label: "Reporting",
    icon: LineChart,
    items: [
      {
        id: "reporting-performance",
        value: "reporting-performance",
        label: "Performance",
        description: "GA4 organic traffic and Search Console for the active property",
        icon: LineChart,
        organicDashboard: true,
      },
    ],
  },
  {
    id: "teams",
    label: "Teams",
    icon: Users,
    items: [
      {
        value: "users",
        label: "Users",
        description: "Agency seats, invites, and member profiles",
        icon: UserRound,
      },
      {
        value: "chat",
        label: "Chat",
        description: "Team channels and direct messages",
        icon: MessageCircle,
      },
      {
        value: "tasks",
        label: "Tasks",
        description: "Team projects, tasks, and notes",
        icon: CheckSquare,
      },
      {
        value: "support",
        label: "Support",
        description: "Pulse Assist tickets, chat logs, and export",
        icon: LifeBuoy,
      },
    ],
  },
  {
    id: "forge",
    label: "Forge",
    icon: Zap,
    items: [
      {
        value: "pulse-forge",
        label: "Task Builder",
        description: "Workflow automations, recipes, and schedules",
        icon: Zap,
      },
    ],
  },
  {
    id: "tools",
    label: "Tools",
    icon: Wrench,
    items: [
      {
        id: "tools-seo",
        value: "seo",
        label: "SEO",
        description: "Search engine optimization and sitemaps",
        icon: Search,
        children: [
          {
            value: "generator",
            label: "Generator",
            description: "Opt, CSV, prompt, import, PR, entity, pages, flow, image, and research",
            icon: TrendingUp,
          },
          {
            value: "sitemap-optimizer",
            label: "Sitemap",
            description: "Cluster, merge, publish overlapping URLs, and URL optimization",
            icon: GitMerge,
          },
          {
            value: "vertical-benchmarks",
            label: "Industry verticals",
            description: "GSC top 10 per NEO Pulse property, bulk CSV packages",
            icon: Layers,
          },
        ],
      },
      {
        id: "tools-social",
        value: "social",
        label: "Social",
        description: "Social media and Google Business Profile",
        icon: Share2,
        children: [
          {
            value: "gbp-post",
            label: "GBP",
            description: "Keyword harness, site image match, money-page button, publish to Google Business Profile",
            icon: Megaphone,
          },
          {
            value: "content-calendar",
            label: "Calendar",
            description: "AI content calendar sheet",
            icon: TrendingUp,
          },
          {
            value: "social-creator",
            label: "Creator",
            description: "Organic post generator with visuals",
            icon: Sparkles,
          },
        ],
      },
      {
        id: "tools-ppc",
        value: "ppc",
        label: "PPC",
        description: "Pay-per-click search and social campaigns",
        icon: Target,
        children: [
          {
            value: "ppc-google",
            label: "Google",
            description: "Search campaigns from WordPress pages and GSC queries",
            icon: Crosshair,
          },
          {
            value: "ppc-meta",
            label: "Meta",
            description: "Feed ads from WordPress page copy and Neo Digital creative",
            icon: Megaphone,
          },
        ],
      },
      {
        id: "tools-video",
        value: "video",
        label: "Video",
        description: "Storyboard and video generation",
        icon: Clapperboard,
        children: [
          {
            value: "video-generator",
            label: "Generator",
            description: "Brief, storyboard, HeyGen render with narration",
            icon: Film,
          },
        ],
      },
    ],
  },
];

/** Nav sections for the active build. */
export function getManagerNavSections(): ManagerNavSection[] {
  return MANAGER_NAV_SECTIONS;
}

/** True when the item or any nested child matches the active workspace tab. */
export function isManagerNavItemActive(
  managerTab: string,
  item: ManagerNavItem,
  dashboardCluster: ManagerSettingsClusterId | undefined,
): boolean {
  if (item.children?.length) {
    return item.children.some((child) =>
      isManagerNavItemActive(managerTab, child, dashboardCluster),
    );
  }
  return isManagerNavItemSelected(managerTab, item, dashboardCluster);
}

/** Mega menu: dashboard rows use `dashboardCluster`; blog generator uses inner side tabs. */
export function isManagerNavItemSelected(
  managerTab: string,
  item: ManagerNavItem,
  dashboardCluster: ManagerSettingsClusterId | undefined,
): boolean {
  if (item.dashboardCluster) {
    return managerTab === "dashboard" && dashboardCluster === item.dashboardCluster;
  }
  if (item.organicDashboard) {
    return managerTab === "organic-reporting";
  }
  if (managerTab === "generator" && item.value === "generator") return true;
  return managerTab === item.value;
}
