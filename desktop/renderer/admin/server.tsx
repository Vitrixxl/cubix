/** The server: how long it has been running, which build, the database and the request log's limits. */
import { useAdmin, useLiveState, type Overview } from "./api";
import { bytes, date, Failure, FiguresSkeleton, Kpi, MONO, num, Section, span, useNow, when, ViewHead } from "./parts";
import { cn } from "@/lib/utils";

function Row({ label, value, hint }: { label: string; value: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="flex min-h-10 items-center gap-4 border-b text-sm last:border-0">
      <span className="w-48 shrink-0 text-muted-foreground max-sm:w-32">{label}</span>
      <span className={cn(MONO, "min-w-0 flex-1 truncate")}>{value}</span>
      {hint && <span className="shrink-0 text-xs text-muted-foreground max-sm:hidden">{hint}</span>}
    </div>
  );
}

export function Server() {
  const live = useLiveState();
  const overview = useAdmin<Overview>("/overview", { tick: Math.floor(live.tick / 3) });
  const now = useNow();
  const d = overview.data?.server;
  return (
    <div className="flex flex-col gap-5 md:gap-6">
      <ViewHead title="Server" sub={d ? `Version ${d.version}${d.build ? ` · build ${d.build}` : ""}` : "The running API"} />
      {overview.error && !d ? (
        <Failure error={overview.error} retry={overview.reload} />
      ) : !d ? (
        <div className="rounded-xl bg-muted/45 px-5 py-4">
          <FiguresSkeleton count={4} className="grid-cols-2 sm:grid-cols-4" />
        </div>
      ) : (
        <>
          <section aria-label="Key figures" className="grid grid-cols-2 gap-x-6 gap-y-5 rounded-xl bg-muted/45 px-5 py-4 sm:grid-cols-4">
            <Kpi label="Uptime" value={span(d.uptimeMs + (now - d.now > 0 ? now - d.now : 0))} sub={`since ${when(d.startedAt)}`} />
            <Kpi label="Database" value={bytes(d.db.bytes)} sub={`${bytes(d.db.freeBytes)} free inside`} />
            <Kpi label="Log rows" value={num(d.db.logRows)} sub={`${num(d.db.importantLogRows)} important`} />
            <Kpi label="Dropped log rows" value={num(d.log.dropped)} sub="since start" />
          </section>
          <div className="grid gap-x-10 gap-y-7 lg:grid-cols-2">
              <section aria-label="Build">
                <Section title="Build" />
                <Row label="Version" value={d.version} />
                <Row label="Build" value={d.build ?? "–"} />
                <Row label="Commit" value={d.commit ? d.commit.slice(0, 12) : "–"} hint={d.commit ?? undefined} />
                <Row label="Started" value={when(d.startedAt, true)} hint={date(d.startedAt)} />
                <Row label="Server clock" value={when(d.now, true)} hint="at the last refresh" />
              </section>
              <section aria-label="Database and log">
                <Section title="Database and request log" />
                <Row label="Database size" value={bytes(d.db.bytes)} hint={`${num(d.db.bytes)} bytes`} />
                <Row label="Free pages" value={bytes(d.db.freeBytes)} />
                <Row label="Log rows" value={`${num(d.db.logRows)} / ${num(d.log.maxRows)}`} hint="ordinary rows kept" />
                <Row label="Important rows" value={`${num(d.db.importantLogRows)} / ${num(d.log.maxImportantRows)}`} />
                <Row label="Oldest log row" value={d.db.oldestLogAt ? when(d.db.oldestLogAt) : "–"} />
                <Row label="Log retention" value={`${num(d.log.retentionDays)} days`} />
                <Row label="Traffic per IP kept" value={`${num(d.log.trafficDays)} days`} />
              </section>
          </div>
        </>
      )}
    </div>
  );
}
