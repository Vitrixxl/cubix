/**
 * The account page: who they are beside their year of practice, the chosen event's figures and curve,
 * then training, achievements and battles, the whole overview inside the window. Each section opens its own page.
 */
import { BookA, BookOpen, Download, FileJson, LogOut, Settings, Sheet, Timer, Upload } from "lucide-react";
import { store as s } from "./store";
import { Avatar, Back, Button, Figure, InHead, MenuAction, MoreMenu, PAGE, PageHead, PuzzleButton, SelectMenu, Stats, Surface, Tip, plural, usePhone, useQuiet } from "./ui";
import { TimerStats } from "./stats";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button as UiButton } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Heatmap } from "./profile/heatmap";
import { AchievementsSection, BattlesSection, TimerSection, TrainingSection } from "./profile/sections";
import { AchievementsPage, BattlesPage, TrainingPage } from "./profile/pages";
import { AnalysisPage } from "./profile/analysis";
import { useProfileData, type ProfileData } from "./profile/data";
import { tr } from "../../src/client/i18n";
import { said } from "./base";

const SECTIONS: Record<string, string> = { playground: "Timer", training: "Training", achievements: "Achievements", duels: "Battles", analysis: "Analysis" };

/** The reading column: the page's padding, centred and capped like GitHub's. */
const COLUMN = cn(PAGE, "mx-auto w-full max-w-7xl");

/** Bringing times from another timer (or a Qbix export), and taking all of them away as a file. */
function DataButtons() {
  const variant = useQuiet();
  return (
    <>
      <Button action="importTimes" icon={Upload} tip={tr("Import times")} />
      <DropdownMenu>
        <Tip content={tr("Export")}>
          <DropdownMenuTrigger render={<UiButton variant={variant} size="icon" aria-label={tr("Export")} data-action="menu:export" />}>
            <Download />
          </DropdownMenuTrigger>
        </Tip>
        <DropdownMenuContent align="end" className="w-auto">
          <MenuAction action="exportSolves" icon={Sheet}>
            {tr("My solves, as a table (CSV)")}
          </MenuAction>
          <MenuAction action="exportData" icon={FileJson}>
            {tr("All my profile's data (JSON)")}
          </MenuAction>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

/**
 * Who they are and how much they practise, every event together: the avatar and name, then six figures two by two,
 * so that their labels are never cut. Phones keep the page's other actions in its "…" menu.
 */
function Identity({ d, phone }: { d: ProfileData; phone: boolean }) {
  const user = s.user;
  return (
    <Surface className={cn("min-w-0 justify-between gap-5 p-5", phone && "p-4")}>
      <div className="flex min-w-0 items-center gap-4">
        <Avatar name={user?.username} size={48} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h2 className="truncate text-xl font-semibold tracking-tight">{user?.username}</h2>
          <p className="truncate text-sm text-muted-foreground">{user?.joined ? tr("Joined {0}", { 0: user.joined }) : null}</p>
        </div>
        {phone && (
          <InHead.Provider value={true}>
            <MoreMenu>
              <MenuAction action="importTimes" icon={Upload}>
                {tr("Import times")}
              </MenuAction>
              <MenuAction action="exportSolves" icon={Sheet}>
                {tr("Export my solves (CSV)")}
              </MenuAction>
              <MenuAction action="exportData" icon={FileJson}>
                {tr("Export all my data (JSON)")}
              </MenuAction>
              <MenuAction action="notation" icon={BookA}>
                {tr("Notation")}
              </MenuAction>
              <MenuAction action="help" icon={BookOpen}>
                {tr("Guides")}
              </MenuAction>
              <MenuAction action="settings" icon={Settings}>
                {tr("Settings")}
              </MenuAction>
            </MoreMenu>
          </InHead.Provider>
        )}
      </div>
      <section aria-label={tr("Summary")}>
        <Stats className="grid-cols-2 gap-y-3">
          <Figure caption="plain" size="xl" label={tr("Solves")} value={d.activity.length.toLocaleString()} />
          <Figure caption="plain" size="xl" label={tr("Active days")} value={d.days.toLocaleString()} />
          <Figure caption="plain" size="xl" label={tr("Streak")} value={String(d.streak.current)} tone={d.streak.current ? "warning" : ""} />
          <Figure caption="plain" size="xl" label={tr("Best streak")} value={String(d.streak.longest)} />
          <Figure caption="plain" size="xl" label={tr("This week")} value={d.week.toLocaleString()} />
          <Figure caption="plain" size="xl" label={tr("Trained")} value={d.trainingSolves.toLocaleString()} />
        </Stats>
      </section>
    </Surface>
  );
}

/**
 * The overview fills the window under its header, as cards with room between them: who they are beside their year of
 * practice; the chosen event's figures and curve, its event picked in its title; training, achievements and battles
 * along the bottom. A short window scrolls the cards inside, under the header.
 */
function Overview() {
  const d = useProfileData();
  return (
    <div className={COLUMN}>
      <PageHead title={tr("Profile")}>
        <DataButtons />
      </PageHead>
      {/* The margin given back keeps the cards' outlines clear of the scrolling edge. */}
      <div data-tour="profile-overview" className="-m-1 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-1">
        <div className="grid shrink-0 grid-cols-[20rem_minmax(0,1fr)] gap-4 2xl:grid-cols-[22rem_minmax(0,1fr)]">
          <Identity d={d} phone={false} />
          <Heatmap solves={d.activity} latest={d.latest} phone={false} />
        </div>
        <div className="flex min-h-64 flex-1 flex-col">
          <TimerSection d={d} phone={false} fill />
        </div>
        <div className="grid shrink-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)_19rem] gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_22rem]">
          <TrainingSection d={d} compact />
          <AchievementsSection d={d} compact />
          <BattlesSection compact />
        </div>
      </div>
    </div>
  );
}

/** Phones: the same cards one under the other, scrolling inside the page; signing out closes the list, centred. */
function PhoneOverview() {
  const d = useProfileData();
  return (
    <div data-tour="profile-overview" className="flex flex-col gap-3">
      <Identity d={d} phone />
      <TimerSection d={d} phone />
      <Heatmap solves={d.activity} latest={d.latest} phone />
      <TrainingSection d={d} />
      <AchievementsSection d={d} />
      <BattlesSection />
      <div className="flex justify-center pb-2">
        <Button action="logout" icon={LogOut} variant="ghost" className="text-muted-foreground hover:text-destructive">
          {tr("Log out")}
        </Button>
      </div>
    </div>
  );
}

function TimerPage({ phone }: { phone: boolean }) {
  const p = s.profile,
    count = p.playground?.summary?.count ?? 0;
  return (
    <>
      <PageHead title={tr("Timer")} sub={count ? plural(count, "solve") : undefined} lead={!phone && <Back action="profileMode:overview" label="Back to the profile" />}>
        {!phone && <PuzzleButton profile />}
        <SelectMenu action="profileScramble" caption="Scramble" value={s.profileScramble} options={s.info(s.profilePuzzle).scrambles.map((id: string) => ({ id, label: s.label("scrambles", id) }))} />
      </PageHead>
      <TimerStats
        data={p.playground}
        empty={
          <>
            <span>{tr("No times in this selection yet.")}</span>
            <Button action="nav:playground" icon={Timer} variant="outline">
              {tr("Open the timer")}
            </Button>
          </>
        }
      />
    </>
  );
}

function SubPage({ mode, phone }: { mode: string; phone: boolean }) {
  return mode === "playground" ? (
    <TimerPage phone={phone} />
  ) : mode === "training" ? (
    <TrainingPage phone={phone} />
  ) : mode === "achievements" ? (
    <AchievementsPage phone={phone} />
  ) : mode === "analysis" ? (
    <AnalysisPage phone={phone} />
  ) : (
    <BattlesPage phone={phone} />
  );
}

/** The page on its way, shaped like it: its header, who they are beside the activity, the curve, three cards under them. */
function ProfileSkeleton({ phone }: { phone: boolean }) {
  return phone ? (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label={tr("Loading")}>
      <Skeleton className="h-36 rounded-xl" />
      <Skeleton className="h-48 rounded-xl" />
      <Skeleton className="h-72 rounded-xl" />
    </div>
  ) : (
    <div className={COLUMN} aria-busy="true" aria-label={tr("Loading")}>
      <div className="flex min-h-10 shrink-0 items-center justify-between">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-8 w-18" />
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        <div className="grid shrink-0 grid-cols-[20rem_minmax(0,1fr)] gap-4 2xl:grid-cols-[22rem_minmax(0,1fr)]">
          <Skeleton className="h-56 rounded-xl" />
          <Skeleton className="h-56 rounded-xl" />
        </div>
        <Skeleton className="min-h-0 flex-1 rounded-xl" />
        <div className="grid shrink-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)_19rem] gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_22rem]">
          <Skeleton className="h-36 rounded-xl" />
          <Skeleton className="h-36 rounded-xl" />
          <Skeleton className="h-36 rounded-xl" />
        </div>
      </div>
    </div>
  );
}

/** Account page: the overview, or one of its sections opened from it as a page of its own. */
export function Profile() {
  const phone = usePhone(),
    p = s.profile,
    mode = s.profileMode in SECTIONS ? s.profileMode : "overview";
  if (phone) return <PhoneProfile mode={mode} />;
  if (!p) return <ProfileSkeleton phone={false} />;
  return mode === "overview" ? (
    <section className="h-full min-h-0" aria-label={tr("Profile")}>
      <Overview />
    </section>
  ) : (
    <section className={cn(COLUMN, "profile-main")} aria-label={said(SECTIONS[mode])}>
      <SubPage mode={mode} phone={false} />
    </section>
  );
}

/** The phone's tabs: the overview, then each section under a short name. */
const PHONE_TABS = () => [
  ["overview", tr("Overview")],
  ["playground", tr("Timer")],
  ["training", tr("Training")],
  ["achievements", tr("Awards")],
  ["duels", tr("Battles")],
];

/**
 * Phones: the sections as tabs on top; the overview scrolls under them, the other sections keep the screen's height
 * and scroll inside their card.
 */
function PhoneProfile({ mode }: { mode: string }) {
  const p = s.profile;
  return (
    <div className={PAGE}>
      <Tabs value={mode} onValueChange={(v: string) => void s.action("profileMode:" + v)} className="shrink-0">
        <TabsList className="w-full max-md:h-11!">
          {PHONE_TABS().map(([id, label]) => (
            <TabsTrigger key={id} value={id} data-action={"profileMode:" + id} className="px-1 text-xs">
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {!p ? (
        <ProfileSkeleton phone />
      ) : mode === "overview" ? (
        <section className="-mx-4 min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-4 pt-px" aria-label={tr("Profile")}>
          <PhoneOverview />
        </section>
      ) : (
        <section className="profile-main flex min-h-0 flex-1 flex-col gap-3" aria-label={said(SECTIONS[mode])}>
          <SubPage mode={mode} phone />
        </section>
      )}
    </div>
  );
}
