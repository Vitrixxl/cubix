import { CalendarClock, CalendarDays, Check, ChevronDown, IdCard, LayoutDashboard, MessagesSquare, Search, Sparkles, Users, type LucideIcon } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { Sheet } from "../components/Sheet";
import { Empty, Label, ListSkeleton, Page, PageHead } from "../components/layout";
import { Apply } from "../components/coaching/apply";
import { BookPage, CoachList, CoachPage } from "../components/coaching/browse";
import { CoachProfile, Dashboard, StudentsView } from "../components/coaching/coach";
import { CoachingMessages } from "../components/coaching/CoachingMessages";
import { COACH_SECTIONS, coaching, useCoaching, type SectionId } from "../components/coaching/client";
import { Count, useCoachingNav } from "../components/coaching/parts";
import { Schedule } from "../components/coaching/schedule";
import { Sessions } from "../components/coaching/sessions";
import { tr } from "../../../src/client/i18n";

/**
 * The coaching page, after the web's phone layout (desktop/renderer/coaching/page.tsx). Players find a coach, book one
 * of their slots, follow their sessions and talk with them; coaches also get their dashboard, students, schedule and
 * profile. The sections are a menu in the page head; a coach's page and their booking take the whole page.
 */
export function CoachingPage({ view: path = "" }: { view?: string }) {
  const c = useCoaching(), nav = useCoachingNav();
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
  if (view === "coach" && arg) return sub === "book" ? <BookPage id={arg} /> : <CoachPage id={arg} />;
  return <Page>
    <PageHead title={tr("Coaching")}><SectionMenu view={view} /></PageHead>
    <View className="min-h-0 flex-1">
      {view === "dashboard" ? <Dashboard />
        : view === "students" ? <StudentsView id={arg} />
          : view === "schedule" ? <Schedule />
            : view === "profile" ? <CoachProfile />
              : view === "sessions" ? <Sessions />
                : view === "messages" ? <CoachingMessages conversationId={arg ? Number(arg) : undefined} />
                  : view === "apply" ? <Apply />
                    : view === "coaches" ? <CoachList />
                      : !me && c.failure ? <Empty icon={MessagesSquare} title={c.failure}>
                        <Button variant="outline" onPress={() => void coaching.load("me")}><Text>{tr("Retry")}</Text></Button>
                      </Empty> : <ListSkeleton />}
    </View>
  </Page>;
}

const ICONS: Record<SectionId, LucideIcon> = {
  dashboard: LayoutDashboard, students: Users, schedule: CalendarClock, profile: IdCard,
  coaches: Search, sessions: CalendarDays, messages: MessagesSquare, apply: Sparkles,
};

/** The sections in the page head: the current one with the unread messages, opening a sheet of radio rows. */
function SectionMenu({ view }: { view: string }) {
  const c = useCoaching(), nav = useCoachingNav();
  const [open, setOpen] = useState(false);
  const groups = c.sections(), current = groups.flat().find(([id]) => id === view);
  return <>
    <Button variant="outline" className="h-11 gap-1.5 rounded-lg px-3" accessibilityLabel={tr("Sections: {0}", { 0: current ? tr(current[1]) : tr("Sections") })} onPress={() => setOpen(true)} testID="coaching-sections">
      {current ? <Icon as={ICONS[current[0]]} size={16} /> : null}
      <Text numberOfLines={1} className="shrink text-sm">{current ? tr(current[1]) : tr("Sections")}</Text>
      <Count n={c.me?.unread ?? 0} />
      <Icon as={ChevronDown} size={14} className="text-muted-foreground" />
    </Button>
    <Sheet open={open} onClose={() => setOpen(false)} title={tr("Coaching")} hideTitle>
      <View accessibilityRole="radiogroup" accessibilityLabel={tr("Sections")} className="gap-3">
        {groups.map((group, i) => <View key={i} className={cn("gap-0.5", i > 0 && "border-t border-border pt-3")}>
          {c.isCoach ? <Label className="px-3 pb-1">{i === 0 ? tr("Your coaching") : tr("Get coached")}</Label> : null}
          {group.map(([id, label]) => {
            const on = id === view;
            return <Pressable key={id} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={tr(label)} testID={"coaching-" + id}
              onPress={() => { setOpen(false); if (!on) nav.go(id); }}
              className={cn("min-h-12 flex-row items-center gap-3 rounded-lg px-3 active:bg-muted", on && "bg-muted")}>
              <Icon as={ICONS[id]} size={18} className={on ? "text-foreground" : "text-muted-foreground"} />
              <Text className={cn("flex-1 text-base", on && "font-medium")}>{tr(label)}</Text>
              <Count n={c.badge(id)} />
              {on ? <Icon as={Check} size={16} className="text-primary" /> : null}
            </Pressable>;
          })}
        </View>)}
      </View>
    </Sheet>
  </>;
}
