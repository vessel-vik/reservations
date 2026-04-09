/**
 * Same-origin /api calls must include the Clerk session cookie.
 * Use this from client components instead of bare fetch when calling authenticated routes.
 */
export function fetchWithSession(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  return fetch(input, { ...init, credentials: "include" });
}
