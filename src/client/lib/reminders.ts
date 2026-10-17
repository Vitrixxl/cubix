/**
 * The reminders the app shows once a day when it opens (web and phone), unless turned off in the settings: the learned
 * cases due for review (`dueCases`), then a streak that ends tonight without a solve.
 */
import { tn } from "../i18n";
import { msg } from "../i18n/msg";
import { dayKey } from "./profile";

/** Whether the reminders show (on unless turned off), and the day they last showed, on this device. */
export const REMINDERS_KEY = "cubix.reminders";
export const REMINDED_KEY = "cubix.reminders.shown";

export type Reminder = { id: "review" | "streak"; title: string; action: string };

export function reminders({ due, streak }: { due: number; streak: { current: number; today: boolean } }): Reminder[] {
  return [
    ...(due ? [{ id: "review" as const, title: tn(due, "{n} case to review today", "{n} cases to review today"), action: msg("Revision") }] : []),
    ...(streak.current && !streak.today ? [{ id: "streak" as const, title: msg("Keep your {0}-day streak: one solve today", { 0: streak.current }), action: msg("Timer") }] : []),
  ];
}

/** Today's reminders, with them on and none shown yet today (`shown`: the day they last showed, kept at `REMINDED_KEY`). */
export const remindersDue = (on: boolean, shown: string | null | undefined, facts: Parameters<typeof reminders>[0], now = new Date()) =>
  on && shown !== dayKey(now) ? reminders(facts) : [];
