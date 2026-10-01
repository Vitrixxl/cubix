/**
 * The coaching page. Players find a coach, book one of their slots, follow their sessions and talk with them; coaches
 * also get their dashboard, students, schedule and profile. A column of sections on the left (a menu on phones), the
 * chosen one beside it; a coach's page and a call take the whole page.
 */
import { useEffect } from "react";
import { CalendarClock, CalendarDays, ChevronDown, IdCard, LayoutDashboard, MessagesSquare, Search, Sparkles, Users, type LucideIcon } from "lucide-react";
import { Link } from "react-router";
import { store as s } from "../store";
import { PAGE, PageHead, usePhone } from "../ui";
import { go } from "../navigation";
import { coaching } from "./client";
import { Count, url } from "./parts";
import { CoachList, CoachPage } from "./browse";
import { Sessions } from "./sessions";
import { Messages } from "./chat";
import { Apply } from "./apply";
import { Dashboard, Schedule, CoachProfile, StudentsView } from "./coach";
import { CallView } from "./callView";
import { cn } from "@/lib/utils";
import { Button as UiButton } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

type Section = [id: string, label: string, icon: LucideIcon];
const COACH: Section[] = [
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

function sections() {
  return coaching.isCoach ? [COACH, PLAYER] : [PLAYER, [APPLY]];
}

export function CoachingPage() {
  const [view = "", arg = ""] = s.coachingView.split("/");
  useEffect(() => {
    void coaching.load("me");
  }, []);
  // The section names its default once the account is known: a coach starts on the dashboard.
  const me = coaching.me;
  useEffect(() => {
    if (me && !view) go(url(coaching.isCoach ? "dashboard" : "coaches"), true);
    // Coach-only sections send others back to the list of coaches.
    if (me && !coaching.isCoach && COACH.some(([id]) => id === view)) go(url("coaches"), true);
  }, [me, view]);
  if (view === "call" && arg) return <CallView id={arg} />;
  if (view === "coach" && arg) return <CoachPage id={arg} />;
  return <Shell view={view} arg={arg} />;
}

function Shell({ view, arg }: { view: string; arg: string }) {
  const phone = usePhone();
  const all = sections().flat(),
    current = all.find(([id]) => id === view);
  const body =
    view === "dashboard" ? (
      <Dashboard />
    ) : view === "students" ? (
      <StudentsView id={arg} />
    ) : view === "schedule" ? (
      <Schedule />
    ) : view === "profile" ? (
      <CoachProfile />
    ) : view === "sessions" ? (
      <Sessions />
    ) : view === "messages" ? (
      <Messages id={arg ? Number(arg) : null} />
    ) : view === "apply" ? (
      <Apply />
    ) : view === "coaches" ? (
      <CoachList />
    ) : null;
  return (
    <div className={PAGE}>
      <PageHead title="Coaching" sub={current?.[1]}>
        {phone && <PhoneSections view={view} />}
      </PageHead>
      <div className="flex min-h-0 flex-1 gap-5">
        {!phone && (
          <nav aria-label="Coaching" className="flex w-52 shrink-0 flex-col gap-4">
            {sections().map((group, i) => (
              <div key={i} className="flex flex-col gap-0.5">
                {coaching.isCoach && <span className="px-2.5 pb-1 text-xs font-medium text-muted-foreground">{i === 0 ? "Your coaching" : "Get coached"}</span>}
                {group.map(([id, label, I]) => (
                  <Link
                    key={id}
                    to={url(id)}
                    data-action={"coaching:" + id}
                    aria-current={view === id ? "page" : undefined}
                    className="flex h-9 items-center gap-2.5 rounded-md px-2.5 text-sm text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 aria-[current=page]:bg-muted aria-[current=page]:font-medium aria-[current=page]:text-foreground [&_svg]:size-4"
                  >
                    <I />
                    <span className="truncate">{label}</span>
                    <Count n={badge(id)} />
                  </Link>
                ))}
              </div>
            ))}
          </nav>
        )}
        <main className="flex min-h-0 min-w-0 flex-1 flex-col">{body}</main>
      </div>
    </div>
  );
}

/** Unread messages, and the coach's students waiting for an answer. */
function badge(id: string) {
  if (id === "messages") return coaching.me?.unread ?? 0;
  if (id === "students") return coaching.dashboard?.students.reduce((n, st) => n + st.unread, 0) ?? 0;
  return 0;
}

function PhoneSections({ view }: { view: string }) {
  const current = sections().flat().find(([id]) => id === view),
    I = current?.[2];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<UiButton variant="outline" data-action="coaching:sections" className="gap-1.5" />}>
        {I && <I />}
        {current?.[1] ?? "Sections"}
        {!!coaching.me?.unread && <span className="size-2 rounded-full bg-primary" aria-label="Unread messages" />}
        <ChevronDown className="text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto min-w-52">
        {sections().map((group, i) => (
          <DropdownMenuGroup key={i}>
            {i > 0 && <DropdownMenuSeparator />}
            {coaching.isCoach && <DropdownMenuLabel>{i === 0 ? "Your coaching" : "Get coached"}</DropdownMenuLabel>}
            {group.map(([id, label, I]) => (
              <DropdownMenuItem key={id} data-action={"coaching:" + id} onClick={() => go(url(id))} className={cn(view === id && "bg-muted")}>
                <I />
                {label}
                <Count n={badge(id)} />
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
