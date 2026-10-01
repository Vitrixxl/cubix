/** Overview: how the app is used today and over the last 30 days, the latest important requests as they happen and the
 * most active accounts of the week. */
import { useMemo } from "react";
import { ChevronRight } from "lucide-react";
import { useAdmin, useLiveState, useMostActive, type LogRow, type Overview as Data } from "./api";
import { DailyChart } from "./charts";
import { ago, Failure, FiguresSkeleton, IpLink, Kpi, Link, NUMERIC, num, SectionHead, Status, useNow, UserLink, userPath, ViewHead, when, Nothing } from "./parts";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

export function Overview({ phone }: { phone: boolean }) {
  const live = useLiveState();
  const overview = useAdmin<Data>("/overview", { tick: live.tick });
  const d = overview.data;
  return (
    <div className="flex flex-col gap-5 md:gap-6">
      <ViewHead title="Overview" sub="Every account and request · last 30 days, UTC" />
      {overview.error && !d ? (
        <Failure error={overview.error} retry={overview.reload} />
      ) : !d ? (
        <OverviewSkeleton phone={phone} />
      ) : (
        <>
          <Figures d={d} />
          <section aria-label="Last 30 days">
            <div className="grid gap-x-10 gap-y-7 lg:grid-cols-2">
              <DailyChart
                title="Active accounts"
                total={`${num(d.users.active.d30)} in 30 d`}
                data={d.series}
                series={[
                  { key: "active", label: "Active", color: "var(--chart-1)" },
                  { key: "signups", label: "New", color: "var(--chart-2)", kind: "line" },
                ]}
              />
              <DailyChart
                title="Requests"
                total={`${num(d.series.reduce((n, day) => n + day.requests, 0))} in 30 d`}
                data={d.series}
                series={[
                  { key: "requests", label: "Requests", color: "var(--chart-1)" },
                  { key: "errors", label: "Errors", color: "var(--destructive)", kind: "line" },
                ]}
              />
              <DailyChart title="Distinct IPs" total={`${num(d.ips.d30)} in 30 d`} data={d.series} series={[{ key: "ips", label: "IPs", color: "var(--chart-1)" }]} />
              <DailyChart
                title="Solves"
                total={`${num(d.series.reduce((n, day) => n + day.solves, 0))} in 30 d`}
                data={d.series}
                series={[{ key: "solves", label: "Solves", color: "var(--chart-1)" }]}
              />
            </div>
          </section>
        </>
      )}
      <div className="grid gap-x-8 gap-y-6 lg:grid-cols-2">
        <RecentImportant live={live} />
        <MostActive tick={live.tick} />
      </div>
    </div>
  );
}

function Figures({ d }: { d: Data }) {
  const today = d.series.at(-1)!,
    yesterday = d.series.at(-2) ?? today;
  const change = (key: keyof typeof today) => (today[key] as number) - (yesterday[key] as number);
  return (
    <section aria-label="Key figures" className="grid grid-cols-2 gap-x-6 gap-y-5 rounded-xl bg-muted/45 px-5 py-4 sm:grid-cols-4 xl:grid-cols-8">
      <Kpi label="Accounts" value={num(d.users.total)} sub={`${num(d.users.registered)} + ${num(d.users.guests)} guests`} />
      <Kpi label="Active today" value={num(d.users.active.today)} delta={change("active")} sub={`7 d ${num(d.users.active.d7)} · 30 d ${num(d.users.active.d30)}`} />
      <Kpi label="New today" value={num(d.users.new.today)} delta={change("signups")} sub={`7 d ${num(d.users.new.d7)} · 30 d ${num(d.users.new.d30)}`} />
      <Kpi label="Solves today" value={num(d.solves.today)} delta={change("solves")} sub={`7 d ${num(d.solves.d7)}`} />
      <Kpi label="Requests today" value={num(d.requests.today)} delta={change("requests")} />
      <Kpi
        label="Errors today"
        value={num(d.requests.errorsToday)}
        delta={change("errors")}
        invert
        sub={`${num(d.requests.serverErrorsToday)} 5xx · ${num(d.requests.rateLimitedToday)} limited`}
      />
      <Kpi label="IPs today" value={num(d.ips.today)} delta={change("ips")} sub={`7 d ${num(d.ips.d7)} · ${num(d.ips.live)} live`} />
      <Kpi label="Duels today" value={num(d.duels.today)} delta={change("duels")} sub={`7 d ${num(d.duels.d7)} · ${num(d.duels.total)} all`} />
    </section>
  );
}

/** The latest important requests: the stored ones first, then each one the live socket brings. */
function RecentImportant({ live }: { live: { connected: boolean; tick: number; important: LogRow[] } }) {
  const stored = useAdmin<{ rows: LogRow[] }>("/requests?important=1&limit=8");
  const now = useNow();
  const rows = useMemo(() => {
    const seen = new Set<number>();
    return [...live.important, ...(stored.data?.rows ?? [])].filter((r) => !seen.has(r.id) && seen.add(r.id)).slice(0, 8);
  }, [live.important, stored.data]);
  return (
    <section className="flex min-w-0 flex-col" aria-label="Recent important requests">
      <SectionHead rule title="Recent important requests">
        <Link to="/admin/requests?important=1" className="flex items-center gap-0.5 text-xs text-muted-foreground">
          All <ChevronRight className="size-3.5" />
        </Link>
      </SectionHead>
      {stored.error && !stored.data ? (
        <Failure error={stored.error} retry={stored.reload} className="mt-3" />
      ) : !stored.data ? (
        <ListSkeleton />
      ) : !rows.length ? (
        <Nothing>No important request yet.</Nothing>
      ) : (
        <ul className="flex flex-col">
          {rows.map((r) => (
            <li key={r.id} className="flex h-10 items-center gap-3 border-b text-sm last:border-0">
              <span className={cn(NUMERIC, "w-16 shrink-0 text-xs text-muted-foreground")} title={new Date(r.at).toLocaleString()}>
                {when(r.at, true)}
              </span>
              <Status status={r.status} />
              <span className="min-w-0 flex-1 truncate">
                <span className={cn(NUMERIC, "mr-1.5 text-xs text-muted-foreground")}>{r.method}</span>
                <span className={NUMERIC}>{r.path}</span>
              </span>
              <span className="hidden w-24 shrink-0 truncate text-right text-xs text-muted-foreground sm:block">{r.kind}</span>
              <span className="w-28 shrink-0 truncate text-right text-xs max-sm:hidden">
                {r.userId ? <UserLink id={r.userId} name={r.username} /> : <IpLink ip={r.ip} className="text-muted-foreground" />}
              </span>
              <span className="sr-only">{ago(r.at, now)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** The accounts with the most solves this week. */
function MostActive({ tick }: { tick: number }) {
  const users = useMostActive(Math.floor(tick / 6));
  const now = useNow();
  const top = useMemo(
    () =>
      (users.data?.rows ?? [])
        .filter((u) => u.solves7d > 0)
        .sort((a, b) => b.solves7d - a.solves7d || (b.lastSeenAt ?? 0) - (a.lastSeenAt ?? 0))
        .slice(0, 8),
    [users.data],
  );
  return (
    <section className="flex min-w-0 flex-col" aria-label="Most active accounts">
      <SectionHead rule title="Most active · 7 d">
        <Link to="/admin/users?sort=lastSeen" className="flex items-center gap-0.5 text-xs text-muted-foreground">
          All <ChevronRight className="size-3.5" />
        </Link>
      </SectionHead>
      {users.error && !users.data ? (
        <Failure error={users.error} retry={users.reload} className="mt-3" />
      ) : !users.data ? (
        <ListSkeleton />
      ) : !top.length ? (
        <Nothing>No solves this week.</Nothing>
      ) : (
        <ul className="flex flex-col">
          {top.map((u) => (
            <li key={u.id} className="flex h-10 items-center gap-3 border-b text-sm last:border-0">
              <span className="min-w-0 flex-1 truncate">
                <UserLink id={u.id} name={u.username} guest={u.isGuest} />
              </span>
              <span className={cn(NUMERIC, "w-24 shrink-0 text-right")}>
                {num(u.solves7d)} <span className="text-xs text-muted-foreground">solves</span>
              </span>
              <span className="w-24 shrink-0 text-right text-xs text-muted-foreground max-sm:hidden">{ago(u.lastSeenAt, now)}</span>
              <Link to={userPath(u.id)} className="text-muted-foreground" title="Open">
                <ChevronRight className="size-4" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ListSkeleton() {
  return (
    <div className="flex flex-col" aria-busy="true" aria-label="Loading">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="flex h-10 items-center gap-3 border-b last:border-0">
          <Skeleton className="h-3.5 w-14" />
          <Skeleton className="h-3.5 flex-1" />
          <Skeleton className="h-3.5 w-16" />
        </div>
      ))}
    </div>
  );
}

function OverviewSkeleton({ phone }: { phone: boolean }) {
  return (
    <>
      <div className="rounded-xl bg-muted/45 px-5 py-4">
        <FiguresSkeleton count={phone ? 4 : 8} className="grid-cols-2 sm:grid-cols-4 xl:grid-cols-8" />
      </div>
      <div className="grid gap-x-10 gap-y-7 lg:grid-cols-2">
        {Array.from({ length: phone ? 2 : 4 }, (_, i) => (
          <div key={i} className="flex flex-col gap-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-36 w-full" />
          </div>
        ))}
      </div>
    </>
  );
}
