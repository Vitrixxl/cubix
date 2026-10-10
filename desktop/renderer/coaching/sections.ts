/** The coaching sections: tabs and the coach's menu over the coaching pages, one menu on phones (coaching/page.tsx). */
import { CalendarClock, CalendarDays, IdCard, LayoutDashboard, MessagesSquare, Search, Sparkles, Users, type LucideIcon } from "lucide-react";
import { coaching } from "./client";
import { COACH_SECTIONS, type SectionId } from "../../../src/client/lib/coaching";

export type Section = [id: string, label: string, icon: LucideIcon];
const ICONS: Record<SectionId, LucideIcon> = {
  dashboard: LayoutDashboard,
  students: Users,
  schedule: CalendarClock,
  profile: IdCard,
  coaches: Search,
  sessions: CalendarDays,
  messages: MessagesSquare,
  apply: Sparkles,
};
const withIcons = (list: readonly (readonly [SectionId, string])[]): Section[] => list.map(([id, label]) => [id, label, ICONS[id]]);
export const COACH = withIcons(COACH_SECTIONS);

/** A coach's own sections first, then those of a player; a player can apply to coach. */
export const sections = () => coaching.sections().map(withIcons);
/** Unread messages, offers to move a session, and the coach's students waiting for an answer. */
export const badge = (id: string) => coaching.badge(id);
