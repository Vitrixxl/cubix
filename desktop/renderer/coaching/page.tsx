/**
 * The coaching page. Players find a coach and book one of their slots on the same screen, follow their sessions and
 * talk with them; coaches also get their dashboard, students, schedule and profile. On top, the player's sections as
 * tabs and the coach's in a menu beside them (one menu on phones), then the tools of the page shown; a call takes the
 * whole page.
 */
import { useEffect, useState } from "react";
import { ChevronDown, Sparkles } from "lucide-react";
import { store as s } from "../store";
import { PAGE, Segmented, usePhone } from "../ui";
import { go } from "../navigation";
import { coaching } from "./client";
import { ToolsSlot, url } from "./parts";
import { Count } from "../base";
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { PLAYER_SECTIONS } from "../../../src/client/lib/coaching";
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
  return <Shell view={view} arg={arg} sub={sub} />;
}

function Shell({ view, arg, sub }: { view: string; arg: string; sub: string }) {
  const phone = usePhone(),
    [slot, setSlot] = useState<HTMLElement | null>(null);
  const body =
    view === "coach" && arg ? (
      sub === "book" ? <BookPage id={arg} /> : <CoachPage id={arg} />
    ) : view === "dashboard" ? (
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
  // A coach's page and their booking belong to finding a coach.
  const tab = view === "coach" ? "coaches" : view;
  return (
    <div className={PAGE}>
      <div className="flex shrink-0 flex-wrap items-center gap-2" data-slot="coaching-bar">
        {phone ? (
          <SectionMenu view={tab} />
        ) : (
          <>
            <Segmented
              label="Coaching"
              value={PLAYER_SECTIONS.some(([id]) => id === tab) ? tab : ""}
              onChange={(id) => go(url(id))}
              action="coaching:"
              className="shrink-0 flex-nowrap"
              options={PLAYER_SECTIONS.map(([id, label]) => ({
                id,
                label: (
                  <>
                    {said(label)}
                    <Count n={badge(id)} className="ml-0.5" />
                  </>
                ),
              }))}
            />
            <CoachMenu view={tab} />
          </>
        )}
        <div ref={setSlot} className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2 max-md:flex-1" />
      </div>
      <ToolsSlot.Provider value={slot}>
        <main className="flex min-h-0 min-w-0 flex-1 flex-col">{body}</main>
      </ToolsSlot.Provider>
    </div>
  );
}

/** The coach's own sections in a menu beside the tabs, named after the one shown; for a player, the way to become one. */
function CoachMenu({ view }: { view: string }) {
  const current = COACH.find(([id]) => id === view);
  if (!coaching.isCoach)
    return (
      <UiButton variant={view === "apply" ? "secondary" : "ghost"} onClick={() => go(url("apply"))} data-action="coaching:apply" aria-current={view === "apply" ? "page" : undefined}>
        <Sparkles />
        {tr("Become a coach")}
      </UiButton>
    );
  const waiting = COACH.reduce((n, [id]) => n + badge(id), 0);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<UiButton variant={current ? "secondary" : "ghost"} data-action="coaching:coach-space" />}>
        {tr("Coach space")}
        {current && <span className="text-muted-foreground">· {said(current[1])}</span>}
        <Count n={current ? 0 : waiting} className="ml-0" />
        <ChevronDown className="text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-auto min-w-56">
        <DropdownMenuRadioGroup value={view} onValueChange={(id: string) => go(url(id))}>
          {COACH.map(([id, label, I]) => (
            <DropdownMenuRadioItem key={id} value={id} data-action={"coaching:" + id} closeOnClick>
              <I />
              {said(label)}
              <Count n={badge(id)} />
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** On phones every section in one menu, named after the one shown. */
function SectionMenu({ view }: { view: string }) {
  const current = sections().flat().find(([id]) => id === view),
    I = current?.[2];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<UiButton variant="outline" data-action="coaching:sections" />}>
        {I && <I />}
        {said(current?.[1] ?? "Coaching")}
        <Count n={coaching.me?.unread ?? 0} />
        <ChevronDown className="text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-auto min-w-52">
        <DropdownMenuRadioGroup value={view} onValueChange={(id: string) => go(url(id))}>
          {sections().map((group, i) => (
            <DropdownMenuGroup key={i}>
              {i > 0 && <DropdownMenuSeparator />}
              {coaching.isCoach && <DropdownMenuLabel>{i === 0 ? tr("Coach space") : tr("Get coached")}</DropdownMenuLabel>}
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
