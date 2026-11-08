import "server-only";
import type { QueryResult } from "./analytics-format";

/**
 * Reads analytics back from PostHog for the admin Analytics tab, on the server only.
 * Needs a personal API key with the `query:read` scope (POSTHOG_PERSONAL_API_KEY) and the
 * project id (POSTHOG_PROJECT_ID). The key never reaches the browser.
 */
export function posthogReadConfig() {
  const key = process.env.POSTHOG_PERSONAL_API_KEY?.trim();
  const project = process.env.POSTHOG_PROJECT_ID?.trim();
  const host = (process.env.POSTHOG_API_HOST?.trim() || "https://us.posthog.com").replace(/\/$/, "");
  return key && project ? { key, project, host } : null;
}

/** Runs one HogQL query. Results are cached for 10 minutes so the tab stays fast and cheap. */
export async function hogql(query: string): Promise<QueryResult> {
  const config = posthogReadConfig();
  if (!config) throw new Error("PostHog isn't connected");
  const res = await fetch(`${config.host}/api/projects/${encodeURIComponent(config.project)}/query/`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: { kind: "HogQLQuery", query }, name: "hidl admin" }),
    next: { revalidate: 600 },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`PostHog answered ${res.status}`);
  const json = (await res.json()) as Partial<QueryResult>;
  return { columns: json.columns ?? [], results: json.results ?? [] };
}
