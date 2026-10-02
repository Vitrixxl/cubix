/** The coaching sections, listed under Coaching in the app's sidebar (a menu on phones and with the sidebar folded). */
import { CalendarClock, CalendarDays, IdCard, LayoutDashboard, MessagesSquare, Search, Sparkles, Users, type LucideIcon } from "lucide-react";
import { coaching } from "./client";

export type Section = [id: string, label: string, icon: LucideIcon];
export const COACH: Section[] = [
  ["dashboard", "Dashboard", LayoutDashboard],
  ["students", "Students", Users],
  ["schedule", "Schedule", CalendarClock],
  ["profile", "Coach profile", IdCard],
];
const PLAYER: Section[] = [
  ["coaches", "Find a coach", Search],
  ["sessions", "Sessions", CalendarDays],
  ["messages", "Messages", MessagesSquare],
];
const APPLY: Section = ["apply", "Become a coach", Sparkles];

/** A coach's own sections first, then those of a player; a player can apply to coach. */
export function sections() {
  return coaching.isCoach ? [COACH, PLAYER] : [PLAYER, [APPLY]];
}

/** Unread messages, offers to move a session, and the coach's students waiting for an answer. */
export function badge(id: string) {
  if (id === "messages") return coaching.me?.unread ?? 0;
  // Times a coach offered, waiting for the student's answer.
  if (id === "sessions") return coaching.bookings?.filter((b) => b.role === "student" && b.status === "booked" && b.proposal && b.endsAt > Date.now()).length ?? 0;
  if (id === "students") return coaching.dashboard?.students.reduce((n, st) => n + st.unread, 0) ?? 0;
  return 0;
}
