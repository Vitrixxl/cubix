/**
 * The coaching page. Players find a coach, book one of their slots, follow their sessions and talk with them; coaches
 * also get their dashboard, students, schedule and profile. The sections are a second sidebar sliding out of the app's
 * (a menu on phones); a coach's page, their booking and a call take the whole page.
 */
import { useEffect } from "react";
import { ChevronDown } from "lucide-react";
import { store as s } from "../store";
import { PAGE, PageHead, usePhone } from "../ui";
import { go } from "../navigation";
import { coaching } from "./client";
import { Count, url } from "./parts";
import { COACH, badge, sections } from "./sections";
import { BookPage, CoachList, CoachPage } from "./browse";
import { Sessions } from "./sessions";
import { Messages } from "./chat";
import { Apply } from "./apply";
import { Dashboard, CoachProfile, StudentsView } from "./coach";
import { Schedule } from "./schedule";
import { CallView } from "./callView";
import { cn } from "@/lib/utils";
import { Button as UiButton } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export function CoachingPage() {
  const [view = "", arg = "", sub = ""] = s.coachingView.split("/");
  useEffect(() => {
    void coaching.load("me");
    void coaching.load("bookings");
  }, []);
  // The section names its default once the account is known: a coach starts on the dashboard.
  const me = coaching.me;
  useEffect(() => {
    if (me && !view) go(url(coaching.isCoach ? "dashboard" : "coaches"), true);
    // Coach-only sections send others back to the list of coaches.
    if (me && !coaching.isCoach && COACH.some(([id]) => id === view)) go(url("coaches"), true);
  }, [me, view]);
  if (view === "call" && arg) return <CallView id={arg} />;
  if (view === "coach" && arg) return sub === "book" ? <BookPage id={arg} /> : <CoachPage id={arg} />;
  return <Shell view={view} arg={arg} />;
}

function Shell({ view, arg }: { view: string; arg: string }) {
  // The sections slide out of the app's sidebar (coaching/rail.tsx); phones keep them in a menu here.
  const menu = usePhone();
  const current = sections().flat().find(([id]) => id === view);
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
      <PageHead title={menu ? "Coaching" : (current?.[1] ?? "Coaching")}>
        {menu && <SectionMenu view={view} />}
      </PageHead>
      <main className="flex min-h-0 min-w-0 flex-1 flex-col">{body}</main>
    </div>
  );
}

function SectionMenu({ view }: { view: string }) {
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
