/** URLs own navigation. The data store only receives the route's practice context. */
import type { NavigateFunction } from "react-router";
import { coachingShown, pageUrl, type AppRoute } from "../../src/client/lib/route";

export { pageUrl, readRoute, splitLanguage, type AppRoute } from "../../src/client/lib/route";
let navigate: NavigateFunction | undefined;
export function bindNavigation(fn: NavigateFunction) { navigate = fn; return () => { if (navigate === fn) navigate = undefined; }; }
export function go(to: string | number, replace = false) { if (typeof to === "number") void navigate?.(to); else void navigate?.(to, { replace }); }
/** Coaching on this server (`coachingShown`); shown where there is no address (the prerendering). */
export const COACHING = typeof location === "undefined" || coachingShown(location.origin);
export const goPage = (page: string, options: Partial<AppRoute> = {}, replace = false) => go(pageUrl(page, options), replace);
