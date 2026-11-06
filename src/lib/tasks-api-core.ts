import { getSessionToken } from "@/lib/auth-device";
import { backendApiUrl } from "@/lib/wordpress-api/connection";

export function tasksApi(path: string, options?: RequestInit): Promise<Response> {
  const p = path.startsWith("/") ? path : `/${path}`;
  const headers = new Headers(options?.headers);
  const token = getSessionToken();
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return fetch(backendApiUrl(p), { ...options, headers, credentials: "include", cache: "no-store" });
}

export function api(path: string, options?: RequestInit): Promise<Response> {
  return tasksApi(path, options);
}

export async function readJson<T>(res: Response): Promise<T> {
  try {
    return (await res.json()) as T;
  } catch {
    return {} as T;
  }
}
