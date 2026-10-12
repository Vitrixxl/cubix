import { CalendarClock, CalendarDays, Check, ChevronDown, IdCard, LayoutDashboard, MessagesSquare, Search, Sparkles, Users, type LucideIcon } from "lucide-react-native";
import { Fragment, useEffect, type ReactNode } from "react";
import { View } from "react-native";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { AppBar, SectionTabs } from "../components/AppBar";
import { Docked, Pane } from "../components/chat/kit";
import { Empty, ListSkeleton, Numeric, Segmented } from "../components/layout";
import { Apply } from "../components/coaching/apply";
import { BookPage, CoachList, CoachPage, zone } from "../components/coaching/browse";
import { CoachProfile, Dashboard, StudentsView } from "../components/coaching/coach";
import { CoachingMessages } from "../components/coaching/CoachingMessages";
import { COACH_SECTIONS, coaching, useCoaching, type SectionId } from "../components/coaching/client";
import { Count, useCoachingNav } from "../components/coaching/parts";
import { Schedule } from "../components/coaching/schedule";
import { Sessions } from "../components/coaching/sessions";
import { useLayout } from "../hooks/useLayout";
import { tr } from "../../../src/client/i18n";

/**
 * The coaching page, the Me section's Coaching tab (desktop/renderer/coaching/page.tsx). Players find a coach, book one
 * of their slots, follow their sessions and talk with them; coaches also get their dashboard, students, schedule and
 * profile. The sub-page is chosen in a menu at the top of the content, never a second row of tabs; a coach's page, a
 * conversation, a student and a call are screens of their own. On a tablet the sub-pages are segments, at the foot of
 * the content in portrait as on the phone mockups, at its top on a wide screen; there a coach's page (and its booking)
 * docks beside the list of coaches, and a conversation or a student opens beside their list.
 */
export function CoachingPage({ view: path = "" }: { view?: string }) {
  const c = useCoaching(), nav = useCoachingNav(), { tablet, wide } = useLayout();
  const [view = "", arg = "", sub = ""] = path.split("/");
  useEffect(() => {
    void coaching.load("me");
    void coaching.load("bookings");
  }, []);
  // The section names its default once the account is known: a coach starts on the dashboard.
  const me = c.me;
  useEffect(() => {
    if (me && !view) nav.go(c.isCoach ? "dashboard" : "coaches", true);
    // Coach-only sections send others back to the list of coaches.
    else if (me && !c.isCoach && COACH_SECTIONS.some(([id]) => id === view)) nav.go("coaches", true);
  }, [me, view]);
  // The call loads on first use, with WebRTC.
  if (view === "call" && arg) { const { CallView } = require("../components/coaching/call/CallView") as typeof import("../components/coaching/call/CallView"); return <CallView id={arg} />; }
  const coach = view === "coach" && arg ? sub === "book" ? <BookPage id={arg} /> : <CoachPage id={arg} docked={wide} /> : null;
  if (coach && !wide) return coach;
  if (view === "messages" && arg && !wide) return <CoachingMessages conversationId={Number(arg)} />;
  if (view === "students" && arg && !wide) return <StudentsView id={arg} />;
  // Docked, a coach's page leaves the list of coaches its sub-page.
  const section = coach ? "coaches" : view;
  const times = section === "coaches" ? <Text numberOfLines={1} className="ml-auto shrink text-xs text-muted-foreground">{tr("times in {0}", { 0: zone() })}</Text> : null;
  // On a wide screen a conversation or a student opens beside their list.
  const detail = (list: ReactNode, open: ReactNode) => wide ? <View className="min-h-0 flex-1 flex-row gap-4">
    <View className="w-[380px]">{list}</View>
    <Pane>{open ?? <Empty icon={MessagesSquare} title={tr("Your conversations open here.")} />}</Pane>
  </View> : list;
  return <View className="min-h-0 flex-1">
    <AppBar puzzle={false} />
    <SectionTabs />
    <View className="min-h-0 flex-1 flex-row">
      <View className={cn("min-h-0 flex-1 gap-3 px-4 pt-3 pb-2", tablet && "px-7")}>
        {!tablet ? <View className="flex-row items-center gap-2">
          <SectionMenu view={view} />
          {times}
        </View> : wide ? <View className="flex-row items-center gap-3">
          <SectionSegments view={section} className="min-w-0 max-w-[760px] flex-1" />
          {times}
        </View> : times}
        <View className="min-h-0 flex-1">
          {view === "dashboard" ? <Dashboard />
            : view === "students" ? detail(<StudentsView id="" selected={arg} />, arg ? <StudentsView id={arg} /> : null)
              : view === "schedule" ? <Schedule />
                : view === "profile" ? <CoachProfile />
                  : view === "sessions" ? <Sessions />
                    : view === "messages" ? detail(<CoachingMessages />, arg ? <CoachingMessages conversationId={Number(arg)} /> : null)
                      : view === "apply" ? <Apply />
                        : section === "coaches" ? <CoachList selected={coach ? arg : undefined} />
                          : !me && c.failure ? <Empty icon={MessagesSquare} title={c.failure}>
                            <Button variant="outline" onPress={() => void coaching.load("me")}><Text>{tr("Retry")}</Text></Button>
                          </Empty> : <ListSkeleton />}
        </View>
        {tablet && !wide ? <SectionSegments view={section} /> : null}
      </View>
      {coach ? <Docked>{coach}</Docked> : null}
    </View>
  </View>;
}

/** The sub-pages as segments on a tablet, each with what waits on it. */
function SectionSegments({ view, className }: { view: string; className?: string }) {
  const c = useCoaching(), nav = useCoachingNav();
  return <Segmented label={tr("Sections")} value={view as SectionId} onChange={id => nav.go(id, true)} className={className}
    options={c.sections().flat().map(([id, label]) => ({ id: id as SectionId, label: tr(label), count: c.badge(id), accent: true }))} />;
}

const ICONS: Record<SectionId, LucideIcon> = {
  dashboard: LayoutDashboard, students: Users, schedule: CalendarClock, profile: IdCard,
  coaches: Search, sessions: CalendarDays, messages: MessagesSquare, apply: Sparkles,
};

/** The sub-pages in a menu at the top of the content: the current one in the button, each with what waits on it; the way to become a coach apart. */
function SectionMenu({ view }: { view: string }) {
  const c = useCoaching(), nav = useCoachingNav();
  const groups = c.sections(), current = groups.flat().find(([id]) => id === view),
    upcoming = c.bookings?.filter(b => b.role === "student" && b.status === "booked" && b.endsAt > Date.now()).length ?? 0,
    waiting = groups.flat().reduce((n, [id]) => n + (id === view ? 0 : c.badge(id)), 0);
  return <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button variant="outline" className="h-11 gap-2 rounded-xl px-3.5" accessibilityLabel={tr("Sections: {0}", { 0: current ? tr(current[1]) : tr("Sections") })} testID="coaching-sections">
        <Icon as={current ? ICONS[current[0]] : Search} size={17} />
        <Text numberOfLines={1} className="shrink text-[15px] font-bold">{current ? tr(current[1]) : tr("Sections")}</Text>
        <Count n={waiting} />
        <Icon as={ChevronDown} size={16} className="text-muted-foreground" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" className="w-64 rounded-2xl p-1.5">
      {groups.map((group, i) => <Fragment key={i}>
        {i > 0 ? <DropdownMenuSeparator className="mx-2 my-1" /> : null}
        {c.isCoach ? <DropdownMenuLabel className="px-2.5 pt-2 pb-1 text-[11px] font-bold tracking-widest text-muted-foreground uppercase">{i === 0 ? tr("Your coaching") : tr("Get coached")}</DropdownMenuLabel> : null}
        {group.map(([id, label]) => {
          const on = id === view, apply = id === "apply";
          return <DropdownMenuItem key={id} testID={"coaching-" + id} onPress={() => { if (!on) nav.go(id, true); }} className={cn("min-h-11 gap-2.5 rounded-xl px-2.5", on && "bg-accent")}>
            <Icon as={ICONS[id]} size={17} className={apply ? "text-primary" : on ? "text-foreground" : "text-muted-foreground"} />
            <Text className={cn("flex-1 text-[15px] font-bold", apply && "text-primary")}>{tr(label)}</Text>
            {id === "sessions" && upcoming && !c.badge(id) ? <Numeric className="text-xs text-muted-foreground">{tr("{0} upcoming", { 0: upcoming })}</Numeric> : <Count n={c.badge(id)} />}
            {on ? <Icon as={Check} size={16} className="text-primary" /> : null}
          </DropdownMenuItem>;
        })}
      </Fragment>)}
      {!c.isCoach ? <Text className="px-2.5 pt-0.5 pb-1.5 text-xs text-muted-foreground">{tr("A coach also finds here Dashboard, Students, Schedule and Coach profile.")}</Text> : null}
    </DropdownMenuContent>
  </DropdownMenu>;
}
