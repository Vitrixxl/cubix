/** The addresses the app was used from over a period: counts, first and last seen, the accounts seen from each; a row
 * opens its requests. */
import { navigate, useAdmin, useRoute, withParams, type Ips as Data } from "./api";
import { Globe } from "lucide-react";
import { ago, Failure, FiguresSkeleton, Kpi, NUMERIC, num, Pager, TableSkeleton, SortHead, useNow, UserLink, VIEW, when, ipPath } from "./parts";
import { Empty, PageHead, ROW, SearchField, Segmented, Strip, Tip } from "../base";
import { cn } from "@/lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const LIMIT = 50;

export function Ips({ phone }: { phone: boolean }) {
  const { params } = useRoute();
  const days = params.get("days") ?? "7",
    sort = params.get("sort") ?? "requests",
    order = params.get("order") ?? (sort === "ip" ? "asc" : "desc"),
    q = params.get("q") ?? "",
    page = Number(params.get("page") ?? 0) || 0;
  const query = new URLSearchParams({ days, sort, order, page: String(page), limit: String(LIMIT), ...(q ? { q } : {}) });
  const ips = useAdmin<Data>("/ips?" + query, { keep: true });
  const d = ips.data;
  const now = useNow();
  const head = (id: string, label: string, className = "text-right") => <SortHead id={id} label={label} sort={sort} order={order} params={params} className={className} />;
  return (
    <div className={VIEW}>
      <PageHead title="IP addresses" sub={d ? `Since ${d.since} · UTC days` : "Where the app is used from"} />
      <div className="flex flex-wrap items-center gap-2">
        <SearchField value={q} onChange={(v) => navigate(withParams(params, { q: v, page: null }), true)} delay={300} placeholder="Filter addresses" numeric action="ips:search" className="w-full sm:w-72" />
        <Segmented
          label="Period"
          action="ips:days:"
          value={days}
          onChange={(n) => navigate(withParams(params, { days: n === "7" ? null : n, page: null }), true)}
          options={["1", "7", "30", "90"].map((n) => ({ id: n, label: `${n} d` }))}
        />
      </div>
      {d ? (
        <Strip label="Totals" className="grid-cols-2 sm:grid-cols-4">
          <Kpi label="Addresses" value={num(d.totals.ips)} />
          <Kpi label="Requests" value={num(d.totals.requests)} />
          <Kpi label="Errors" value={num(d.totals.errors)} />
          <Kpi label="Rate-limited" value={num(d.totals.limited)} />
        </Strip>
      ) : (
        !ips.error && (
          <Strip>
            <FiguresSkeleton count={4} className="grid-cols-2 sm:grid-cols-4" />
          </Strip>
        )
      )}
      <div className={cn("min-w-0", ips.loading && d && "opacity-70 transition-opacity")}>
        {ips.error && !d ? (
          <Failure error={ips.error} retry={ips.reload} className="my-2" />
        ) : !d ? (
          <TableSkeleton cols={phone ? 2 : 9} rows={12} />
        ) : !d.rows.length ? (
          <Empty icon={Globe} title="No address in this period." />
        ) : phone ? (
          <ul className="flex flex-col gap-0.5" data-slot="ips-list">
            {d.rows.map((r) => (
              <li key={r.ip}>
                <button type="button" onClick={() => navigate(ipPath(r.ip))} className={cn(ROW, "flex w-full flex-col gap-1 px-2 py-2.5")}>
                  <span className="flex items-center gap-2">
                    <span className={cn(NUMERIC, "min-w-0 flex-1 truncate text-sm")}>{r.ip}</span>
                    <span className={cn(NUMERIC, "text-sm")}>{num(r.requests)}</span>
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {num(r.errors)} errors · {num(r.limited)} limited · {num(r.userCount)} accounts · seen {ago(r.lastSeenAt, now)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <Table data-slot="ips-table">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                {head("ip", "Address", "")}
                {head("requests", "Requests")}
                {head("errors", "Errors")}
                {head("serverErrors", "5xx")}
                {head("limited", "429")}
                <TableHead className="text-right">Days</TableHead>
                {head("firstSeen", "First seen")}
                {head("lastSeen", "Last seen")}
                {head("users", "Accounts", "")}
              </TableRow>
            </TableHeader>
            <TableBody>
              {d.rows.map((r) => (
                <TableRow key={r.ip} className="cursor-pointer" onClick={() => navigate(ipPath(r.ip))} data-ip={r.ip}>
                  <TableCell className={cn(NUMERIC, "font-medium")}>{r.ip}</TableCell>
                  <TableCell className={cn(NUMERIC, "text-right")}>{num(r.requests)}</TableCell>
                  <TableCell className={cn(NUMERIC, "text-right", r.errors ? "text-warning" : "text-muted-foreground")}>{num(r.errors)}</TableCell>
                  <TableCell className={cn(NUMERIC, "text-right", r.serverErrors ? "text-destructive" : "text-muted-foreground")}>{num(r.serverErrors)}</TableCell>
                  <TableCell className={cn(NUMERIC, "text-right", r.limited ? "text-warning" : "text-muted-foreground")}>{num(r.limited)}</TableCell>
                  <TableCell className={cn(NUMERIC, "text-right text-muted-foreground")}>{num(r.activeDays)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    <Tip content={when(r.firstSeenAt)}>
                      <span>{ago(r.firstSeenAt, now)}</span>
                    </Tip>
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    <Tip content={when(r.lastSeenAt)}>
                      <span>{ago(r.lastSeenAt, now)}</span>
                    </Tip>
                  </TableCell>
                  <TableCell className="max-w-56">
                    <span className="flex min-w-0 items-center gap-x-2 overflow-hidden" onClick={(e) => e.stopPropagation()}>
                      {r.users.slice(0, 3).map((u) => (
                        <UserLink key={u.id} id={u.id} name={u.username} />
                      ))}
                      {r.userCount > 3 && <span className={cn(NUMERIC, "shrink-0 text-xs text-muted-foreground")}>+{num(r.userCount - 3)}</span>}
                      {!r.userCount && <span className="text-muted-foreground">–</span>}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
      {d && d.total > 0 && <Pager page={page} limit={LIMIT} total={d.total} params={params} />}
    </div>
  );
}
