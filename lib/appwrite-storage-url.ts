/**
 * Appwrite file view URLs must include a non-empty `project` query param.
 * Stale or hand-built URLs often end with `project=` and return 404 from the CDN.
 */
export function resolveAppwriteFileViewUrl(
  url: string | null | undefined
): string | undefined {
  if (url == null || typeof url !== "string") return undefined;
  const trimmed = url.trim();
  if (!trimmed) return undefined;
  if (!trimmed.includes("/storage/buckets/") || !trimmed.includes("/view")) {
    return trimmed;
  }
  const projectId =
    process.env.NEXT_PUBLIC_PROJECT_ID || process.env.PROJECT_ID;
  if (!projectId) return trimmed;
  try {
    const u = new URL(trimmed);
    const p = u.searchParams.get("project");
    if (p === null || p === "") {
      u.searchParams.set("project", projectId);
      return u.toString();
    }
    return trimmed;
  } catch {
    return trimmed;
  }
}
