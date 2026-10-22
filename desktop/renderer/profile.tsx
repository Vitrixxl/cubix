/**
 * The account page. On the desktop, a sidebar of its own (profile/nav.tsx) beside the page open: the overview (the
 * activity, the records by event and scramble type, the journal) or one of its sections. On phones, tabs over them.
 */
import { useRef, type RefObject } from "react";
import { store as s } from "./store";
import { PAGE, Surface, usePhone } from "./ui";
import { StatsPage } from "./stats";
import { cn } from "@/lib/utils";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BattlesPage, TrainingPage } from "./profile/pages";
import { AchievementsPage } from "./profile/achievements";
import { AnalysisPage } from "./profile/analysis";
import { useProfileData, type ProfileData } from "./profile/data";
import { IdentityCard, Journal, MonthCard, RecordPlates, WeeksCard } from "./profile/journal";
import { ActivityBand, RecordGrid } from "./profile/grid";
import { ProfileNav } from "./profile/nav";
import { tr } from "../../src/client/i18n";
import { said } from "./base";
import { ProfileSkeleton } from "./skeletons";

const SECTIONS: Record<string, string> = { playground: "Timer", training: "Training", achievements: "Awards", duels: "Battles", analysis: "Analysis" };

/** The overview: the activity on a band, then the records' grid beside the journal of the days. */
function Overview({ d }: { d: ProfileData }) {
  return (
    <div data-tour="profile-overview" className="flex min-h-0 flex-1 flex-col gap-4">
      <ActivityBand d={d} />
      {/* Narrow windows put the journal under the grid. */}
      <div className="grid min-h-0 flex-1 grid-rows-2 gap-4 lg:grid-cols-[minmax(0,1fr)_19rem] lg:grid-rows-1 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <RecordGrid d={d} />
        <Surface className="flex min-h-0 flex-col px-5 pt-4 pb-2">
          <Journal d={d} phone={false} />
        </Surface>
      </div>
    </div>
  );
}

/** Phones: the same cards one under the other, scrolling inside the page. */
function PhoneOverview({ scroller }: { scroller: RefObject<HTMLElement | null> }) {
  const d = useProfileData();
  return (
    <div data-tour="profile-overview" className="flex flex-col gap-4 pb-2">
      <IdentityCard />
      <MonthCard d={d} />
      <Journal d={d} phone scroller={scroller} />
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

/** Account page: the overview, or one of its sections opened from the sidebar. */
export function Profile() {
  const phone = usePhone(),
    mode = s.profileMode in SECTIONS ? s.profileMode : "overview";
  if (phone) return <PhoneProfile mode={mode} />;
  if (!s.profile) return <ProfileSkeleton phone={false} />;
  return <DesktopProfile mode={mode} />;
}

function DesktopProfile({ mode }: { mode: string }) {
  const d = useProfileData();
  return (
    <section className={cn(PAGE, "profile-main")} aria-label={mode === "overview" ? tr("Profile") : said(SECTIONS[mode])}>
      <div className="flex min-h-0 flex-1 gap-5">
        <ProfileNav d={d} />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">{mode === "overview" ? <Overview d={d} /> : <SubPage mode={mode} phone={false} />}</div>
      </div>
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
  const p = s.profile,
    scroller = useRef<HTMLElement>(null);
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
        <section ref={scroller} className="-mx-4 min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-4 pt-px" aria-label={tr("Profile")}>
          <PhoneOverview scroller={scroller} />
        </section>
      ) : (
        <section className="profile-main flex min-h-0 flex-1 flex-col gap-3" aria-label={said(SECTIONS[mode])}>
          <SubPage mode={mode} phone />
        </section>
      )}
    </div>
  );
}
