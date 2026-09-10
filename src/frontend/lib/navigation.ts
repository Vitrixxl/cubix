import { SEO_PAGES } from "../seo/pages";
export type Route =
  | { page: "algorithms"; caseId?: string }
  | { page: "training"; autostart?: boolean }
  | { page: "playground" }
  | { page: "community" }
  | { page: "messages"; solveId?: number }
  | { page: "profile"; username?: string; mode?: "playground" | "training"; caseId?: string };

export const routePath = (route: Route) => SEO_PAGES[route.page].path;
export function routeFromPath(pathname: string): Route | undefined {
  const path = pathname === "/" ? "/" : pathname.replace(/\/+$/, "") + "/";
  for (const page of ["playground", "algorithms", "training", "community", "messages", "profile"] as const) {
    if (SEO_PAGES[page].path === path) return { page };
  }
}

export const LAST_TAB_KEY = "cubix.ui.lastTab";

/** History and storage are untrusted, and can outlive a version of the app. */
export function parseRoute(value: unknown): Route | undefined {
  if (!value || typeof value !== "object" || !("page" in value)) return;
  switch (value.page) {
    case "algorithms": return { page: value.page, ...("caseId" in value && typeof value.caseId === "string" ? { caseId: value.caseId } : {}) };
    case "profile": return { page: value.page,
      ...("username" in value && typeof value.username === "string" ? { username: value.username } : {}),
      ...("mode" in value && (value.mode === "training" || value.mode === "playground") ? { mode: value.mode } : {}),
      ...("caseId" in value && typeof value.caseId === "string" ? { caseId: value.caseId } : {}),
    };
    case "messages": return { page: value.page, ...("solveId" in value && typeof value.solveId === "number" && Number.isSafeInteger(value.solveId) && value.solveId !== 0 ? { solveId: value.solveId } : {}) };
    case "training": return { page: value.page, ...("autostart" in value && value.autostart === true ? { autostart: true } : {}) };
    case "playground": case "community": return { page: value.page };
  }
}

export function initialRoute(): Route {
  if (typeof window !== "undefined") {
    const path = window.location?.pathname;
    const address = path ? routeFromPath(path) : undefined;
    const history = parseRoute(window.history.state?.cubixRoute);
    if (history && (!address || history.page === address.page)) return history;
    // Explicit URLs always win over a previously remembered tab.
    if (address) return address;
    try {
      const saved = parseRoute(JSON.parse(window.localStorage.getItem(LAST_TAB_KEY) ?? "null"));
      if (saved) return { page: saved.page };
    } catch { /* Private browsing or invalid saved data: open the default tab. */ }
  }
  return { page: "playground" };
}

export function rememberTab(route: Route): void {
  try {
    // Remember the tab, without replaying a share, training action or another profile.
    window.localStorage.setItem(LAST_TAB_KEY, JSON.stringify({ page: route.page }));
  } catch { /* Navigation must still work when storage is unavailable. */ }
}
