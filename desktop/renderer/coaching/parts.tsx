/** Pieces shared by the coaching pages: their addresses, dates, the way back and the place of their tools. */
import { createContext, useContext } from "react";
import { createPortal } from "react-dom";
import { Back as BaseBack } from "../base";
import { go } from "../navigation";
import { tr, localFormat, perLanguage } from "../../../src/client/i18n";

export const url = (view = "") => "/coaching" + (view ? "/" + view : "");

const dayFormat = localFormat({ weekday: "short", day: "numeric", month: "short" });
const timeFormat = localFormat({ hour: "2-digit", minute: "2-digit" });
export const day = (ms: number) => dayFormat.format(ms);
export const time = (ms: number) => timeFormat.format(ms);
/** "Tue 7 Oct · 18:00–19:00" */
export const span = (start: number, end?: number) => `${day(start)} · ${time(start)}${end ? "–" + time(end) : ""}`;
/** The local calendar day of a moment, as YYYY-MM-DD. */
export function dayKey(ms: number | Date) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const relativeFormat = perLanguage((l) => new Intl.RelativeTimeFormat(l, { numeric: "auto" }));
/** "in 3 hours", "in 2 days", "now", "2 days ago", in the current language. */
export function relative(ms: number, now = Date.now()) {
  const minutes = Math.round((ms - now) / 60_000),
    abs = Math.abs(minutes),
    format = relativeFormat();
  if (abs < 1) return tr("now");
  if (abs < 60) return format.format(minutes, "minute");
  if (abs < 48 * 60) return format.format(Math.round(minutes / 60), "hour");
  return format.format(Math.round(minutes / 1440), "day");
}
export const clockTime = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/** The header's back arrow, to a coaching address. */
export function Back({ to, label = "Back" }: { to: string; label?: string }) {
  return <BaseBack onClick={() => go(to)} label={label} action="coaching:back" />;
}

/** Where a coaching page puts its own tools: on the right of the tabs (coaching/page.tsx). */
export const ToolsSlot = createContext<HTMLElement | null>(null);
/** The page's own tools (filters, the way back), drawn beside the coaching tabs. */
export function Tools({ children }: { children: React.ReactNode }) {
  const slot = useContext(ToolsSlot);
  return slot ? createPortal(children, slot) : null;
}
