/** URLs own navigation. The data store only receives the route's practice context. */
import type { NavigateFunction } from "react-router";
import { pageUrl, type AppRoute } from "../../src/client/lib/route";

export { pageUrl, readRoute, type AppRoute } from "../../src/client/lib/route";
let navigate: NavigateFunction | undefined;
export function bindNavigation(fn: NavigateFunction) { navigate = fn; return () => { if (navigate === fn) navigate = undefined; }; }
export function go(to: string | number, replace = false) { if (typeof to === "number") void navigate?.(to); else void navigate?.(to, { replace }); }
export const goPage = (page: string, options: Partial<AppRoute> = {}, replace = false) => go(pageUrl(page, options), replace);
