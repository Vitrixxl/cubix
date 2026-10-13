import { useAtomValue, useSetAtom } from "jotai";
import { ChevronDown, ChevronLeft, X } from "lucide-react-native";
import { useEffect, useRef, type ReactNode } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { useLayout } from "../hooks/useLayout";
import { cubeSwitchLockedAtom, eventAtom, goBackAtom, replaceRouteAtom, routeAtom, SECTION_PAGES, tabOf, type Tab } from "../state";
import { coaching, community, useSocial } from "../lib/social";
import { eventInfo } from "../../../src/shared/puzzles";
import { said, tr } from "../../../src/client/i18n";
import { PuzzleIcon, sessionSheetAtom } from "./PuzzlePicker";

/** The section names, as the bottom bar and the app bar show them. */
export const SECTION_LABELS: Record<Tab, string> = { timer: "Timer", learn: "Learn", algorithms: "Algs", compete: "Challenges", me: "Me" };

/** What waits on a page of a section: unread messages, friend requests and invitations, unread coaching messages. */
export function useWaiting() {
  const messages = useSocial(() => community.me?.unread ?? 0);
  const people = useSocial(() => (community.me ? community.me.incoming.length + community.me.invitations.length : 0));
  const coach = useSocial(() => coaching.me?.unread ?? 0);
  return { messages, people, coaching: coach } as Record<string, number>;
}

/**
 * The puzzle as a filled pill of the app bar; it opens the puzzle sheet (`scramble`: with the scramble type and the
 * time entry, on the timer). Locked while a solve holds the session.
 */
export function PuzzleChip({ scramble = false }: { scramble?: boolean }) {
  const open = useSetAtom(sessionSheetAtom);
  const event = useAtomValue(eventAtom);
  const locked = useAtomValue(cubeSwitchLockedAtom);
  const label = tr(eventInfo(event)?.label ?? event);
  return <Pressable disabled={locked} onPress={() => open(scramble ? "timer" : "puzzle")} accessibilityRole="button"
    accessibilityLabel={tr("Puzzle: {0}", { 0: label })} accessibilityHint={tr("Choose a puzzle")}
    className={cn("h-10 max-w-40 shrink flex-row items-center gap-1.5 rounded-full bg-muted pr-2.5 pl-3 active:bg-muted/70", locked && "opacity-50")}>
    <PuzzleIcon puzzle={event} size={16} />
    <Text numberOfLines={1} className="shrink text-sm font-bold">{label}</Text>
    <Icon as={ChevronDown} size={16} className="text-muted-foreground" />
  </Pressable>;
}

/**
 * The head of a section's page: the section's name in large, the page's own buttons (`children`), the puzzle (unless
 * `puzzle` is false). The section's pages follow as tabs (`SectionTabs`).
 */
export function AppBar({ title, puzzle = true, scramble = false, children }: { title?: ReactNode; puzzle?: boolean; scramble?: boolean; children?: ReactNode }) {
  const route = useAtomValue(routeAtom);
  const { tablet, narrow } = useLayout();
  return <View className={cn("min-h-14 flex-row items-center gap-2 pr-3 pl-5 pt-1", narrow && "gap-1 pl-4", tablet && "min-h-16 pr-6 pl-7 pt-3")}>
    <Text numberOfLines={1} accessibilityRole="header" className={cn("min-w-0 flex-1 text-[28px] font-extrabold tracking-[-0.04em]", narrow && "text-2xl", tablet && "text-[40px]")}>{said(title ?? SECTION_LABELS[tabOf(route.page)])}</Text>
    {children}
    {puzzle && <PuzzleChip scramble={scramble} />}
  </View>;
}

/** The pages of the current section as one row of underlined tabs, with what waits on each; none for a single page. */
export function SectionTabs() {
  const route = useAtomValue(routeAtom), replace = useSetAtom(replaceRouteAtom);
  const waiting = useWaiting();
  const { tablet, width } = useLayout();
  const pages = SECTION_PAGES[tabOf(route.page)];
  // The tab shown is scrolled into view: one past the screen's edge (Coaching, on a phone) would be cut off.
  const scroll = useRef<ScrollView>(null), ends = useRef<Record<string, number>>({});
  const current = pages.find(page => page.has(route))?.id;
  const reveal = () => { const end = current && ends.current[current]; if (end) scroll.current?.scrollTo({ x: Math.max(0, end + 20 - width), animated: false }); };
  useEffect(reveal, [current, width]);
  if (pages.length < 2) return null;
  return <View className="border-b border-border">
    <ScrollView ref={scroll} horizontal showsHorizontalScrollIndicator={false} contentContainerClassName={cn("gap-4 px-5", tablet && "gap-6 px-7")} accessibilityRole="tablist">
      {pages.map(page => {
        const here = page.has(route), n = waiting[page.id] ?? 0;
        return <Pressable key={page.id} accessibilityRole="tab" accessibilityState={{ selected: here }} onPress={() => { if (!here) replace(page.route); }}
          onLayout={e => { ends.current[page.id] = e.nativeEvent.layout.x + e.nativeEvent.layout.width; if (here) reveal(); }}
          className="h-11 flex-row items-center gap-1.5">
          <Text className={cn("text-sm font-bold", here ? "text-foreground" : "text-muted-foreground")}>{tr(page.label)}</Text>
          {n > 0 && <View className="min-w-5 items-center rounded-full bg-primary px-1.5"><Text className="text-xs font-bold text-primary-foreground">{n}</Text></View>}
          {here && <View className="absolute right-0 bottom-0 left-0 h-[3px] rounded-full bg-primary" />}
        </Pressable>;
      })}
    </ScrollView>
  </View>;
}

/**
 * The head of a pushed screen (a page opened from a section's page): back, the title with its line under it, and the
 * screen's own buttons on the right. `onBack` defaults to the history's step back.
 */
export function PushedBar({ title, sub, onBack, back = "back", children }: { title: ReactNode; sub?: ReactNode; onBack?: () => void; back?: "back" | "close"; children?: ReactNode }) {
  const goBack = useSetAtom(goBackAtom);
  const { tablet, narrow } = useLayout();
  return <View className={cn("min-h-14 flex-row items-center gap-1 pr-3 pl-2", tablet && "min-h-16 gap-2 pr-6 pl-5 pt-2")}>
    <Pressable accessibilityRole="button" accessibilityLabel={tr(back === "close" ? "Close" : "Back")} onPress={onBack ?? (() => { goBack(); })}
      className="size-11 items-center justify-center rounded-full active:bg-muted">
      <Icon as={back === "close" ? X : ChevronLeft} size={22} />
    </Pressable>
    <View className="min-w-0 flex-1">
      <Text numberOfLines={1} accessibilityRole="header" className={cn("text-xl font-extrabold tracking-[-0.03em]", narrow && "text-lg", tablet && "text-[32px] tracking-[-0.04em]")}>{said(title)}</Text>
      {sub ? <Text numberOfLines={1} className={cn("text-xs text-muted-foreground", tablet && "text-sm")}>{said(sub)}</Text> : null}
    </View>
    {children ? <View className="shrink-0 flex-row items-center gap-1.5">{children}</View> : null}
  </View>;
}
