import { useLocation } from "react-router-dom";
import { appNavigate } from "@/lib/app-navigation";
import { getDefaultApiDocSlug } from "@/lib/api-docs/api-docs-constants";

export function isApiTabPath(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}

export function readApiDocsSlugFromPath(pathname: string): string {
  const match = pathname.match(/^\/api\/(.+)$/);
  if (match?.[1]) return match[1].replace(/\/+$/, "");
  return getDefaultApiDocSlug();
}

export function setApiDocsRoute(slug: string): void {
  const normalized = slug.replace(/^\/+|\/+$/g, "") || getDefaultApiDocSlug();
  appNavigate(normalized === getDefaultApiDocSlug() ? "/api" : `/api/${normalized}`);
}

export function useApiDocsSlug(): string {
  const { pathname } = useLocation();
  return readApiDocsSlugFromPath(pathname);
}
