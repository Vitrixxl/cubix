/**
 * The account page, a practice notebook: who they are and their records, the journal of their days, the month and
 * the weeks' best averages, the whole overview inside the window. Each section opens its own page.
 */
import { store as s } from "./store";
import { PAGE, usePhone } from "./ui";
import { StatsPage } from "./stats";
import { cn } from "@/lib/utils";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BattlesPage, TrainingPage } from "./profile/pages";
import { AchievementsPage } from "./profile/achievements";
import { AnalysisPage } from "./profile/analysis";
import { useProfileData } from "./profile/data";
import { IdentityCard, Journal, MonthCard, RecordPlates, WeeksCard } from "./profile/journal";
import { tr } from "../../src/client/i18n";
import { said } from "./base";
import { ProfileSkeleton } from "./skeletons";

const SECTIONS: Record<string, string> = { playground: "Timer", training: "Training", achievements: "Achievements", duels: "Battles", analysis: "Analysis" };

/** The reading column: the page's padding, centred and capped like GitHub's. */
const COLUMN = cn(PAGE, "mx-auto w-full max-w-7xl");

/**
 * The notebook fills the window under the header in three columns: who they are and their records; the journal of
 * their days; the month and the best Ao5 of each week. Each column scrolls inside itself when the window is short.
 */
function Overview() {
  const d = useProfileData();
  return (
    <div className={PAGE}>
      <div data-tour="profile-overview" className="grid min-h-0 flex-1 grid-cols-[16rem_minmax(0,1fr)_19rem] gap-5 xl:grid-cols-[18.75rem_minmax(0,1fr)_22.5rem] xl:gap-[22px]">
        <div className="flex min-h-0 flex-col gap-4">
          <IdentityCard />
          <RecordPlates d={d} />
        </div>
        <Journal d={d} phone={false} />
        <div className="-m-1 flex min-h-0 flex-col gap-4 overflow-y-auto p-1">
          <MonthCard d={d} />
          <WeeksCard d={d} />
        </div>
      </div>
    </div>
  );
}

/** Phones: the same cards one under the other, scrolling inside the page. */
function PhoneOverview() {
  const d = useProfileData();
  return (
    <div data-tour="profile-overview" className="flex flex-col gap-4 pb-2">
      <IdentityCard />
      <MonthCard d={d} />
      <Journal d={d} phone />
      <RecordPlates d={d} />
      <WeeksCard d={d} />
    </div>
  );
}

function SubPage({ mode, phone }: { mode: string; phone: boolean }) {
  return mode === "playground" ? (
    <StatsPage phone={phone} />
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
