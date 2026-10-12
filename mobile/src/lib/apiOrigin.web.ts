export const PRODUCTION_API_ORIGIN = "https://cubix.vitrixxl.fr";

/** In the browser the app is served by the API itself (go-api/web.go, desktop/dev.ts): its origin is the page's. */
export function apiOrigin(_updateUrl?: string): string {
  return location.origin;
}
