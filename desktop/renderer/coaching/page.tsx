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
import { url } from "./parts";
import { Count } from "../base";
import { COACH, badge, sections } from "./sections";
import { BookPage, CoachList, CoachPage } from "./browse";
import { Sessions } from "./sessions";
import { Messages } from "./chat";
import { Apply } from "./apply";
import { Dashboard, CoachProfile, StudentsView } from "./coach";
import { Schedule } from "./schedule";
import { CallView } from "./callView";
import { Button as UiButton } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { tr } from "../../../src/client/i18n";
import { said } from "../base";

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
      <PageHead title={menu ? tr("Coaching") : said(current?.[1] ?? "Coaching")}>
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
        {said(current?.[1] ?? "Sections")}
        <Count n={coaching.me?.unread ?? 0} />
        <ChevronDown className="text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto min-w-52">
        <DropdownMenuRadioGroup value={view} onValueChange={(id: string) => go(url(id))}>
          {sections().map((group, i) => (
            <DropdownMenuGroup key={i}>
              {i > 0 && <DropdownMenuSeparator />}
              {coaching.isCoach && <DropdownMenuLabel>{i === 0 ? tr("Your coaching") : tr("Get coached")}</DropdownMenuLabel>}
              {group.map(([id, label, I]) => (
                <DropdownMenuRadioItem key={id} value={id} data-action={"coaching:" + id} closeOnClick>
                  <I />
                  {said(label)}
                  <Count n={badge(id)} />
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuGroup>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
