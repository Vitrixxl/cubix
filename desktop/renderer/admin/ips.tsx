/** The addresses the app was used from over a period: counts, first and last seen, the accounts seen from each; a row
 * opens its requests. */
import { navigate, useAdmin, useRoute, withParams, type Ips as Data } from "./api";
import { ago, Failure, FilterInput, Kpi, MONO, Nothing, num, Pager, ROW_LINK, RowsSkeleton, SortHead, useNow, UserLink, ViewHead, when, ipPath } from "./parts";
import { cn } from "@/lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

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
    <div className="flex flex-col gap-5">
      <ViewHead title="IP addresses" sub={d ? `Since ${d.since} · UTC days` : "Where the app is used from"}>
        <ToggleGroup
          variant="outline"
          value={[days]}
          onValueChange={(v: string[]) => v[0] && navigate(withParams(params, { days: v[0] === "7" ? null : v[0], page: null }), true)}
          aria-label="Period"
        >
          {["1", "7", "30", "90"].map((n) => (
            <ToggleGroupItem key={n} value={n} data-action={"ips:days:" + n} className="px-3">
              {n} d
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </ViewHead>
      <section aria-label="Totals" className="grid grid-cols-2 gap-x-6 gap-y-5 rounded-xl bg-muted/45 px-5 py-4 sm:grid-cols-4">
        <Kpi label="Addresses" value={d ? num(d.totals.ips) : "–"} />
        <Kpi label="Requests" value={d ? num(d.totals.requests) : "–"} />
        <Kpi label="Errors" value={d ? num(d.totals.errors) : "–"} />
        <Kpi label="Rate-limited" value={d ? num(d.totals.limited) : "–"} />
      </section>
      <FilterInput value={q} onCommit={(v) => navigate(withParams(params, { q: v, page: null }), true)} placeholder="Filter addresses" mono action="ips:search" className="w-full sm:w-72" />
      <div className={cn("min-w-0", ips.loading && d && "opacity-70 transition-opacity")}>
        {ips.error && !d ? (
          <Failure error={ips.error} retry={ips.reload} className="my-2" />
        ) : !d ? (
          <RowsSkeleton cols={phone ? 2 : 9} rows={12} />
        ) : !d.rows.length ? (
          <Nothing>No address in this period.</Nothing>
        ) : phone ? (
          <ul className="flex flex-col" data-slot="ips-list">
            {d.rows.map((r) => (
              <li key={r.ip}>
                <button type="button" onClick={() => navigate(ipPath(r.ip))} className="flex w-full flex-col gap-1 border-b py-2.5 text-left last:border-0">
                  <span className="flex items-center gap-2">
                    <span className={cn(MONO, "min-w-0 flex-1 truncate text-sm")}>{r.ip}</span>
                    <span className={cn(MONO, "text-sm")}>{num(r.requests)}</span>
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
                <TableRow key={r.ip} className={ROW_LINK} onClick={() => navigate(ipPath(r.ip))} data-ip={r.ip}>
                  <TableCell className={cn(MONO, "font-medium")}>{r.ip}</TableCell>
                  <TableCell className={cn(MONO, "text-right")}>{num(r.requests)}</TableCell>
                  <TableCell className={cn(MONO, "text-right", r.errors ? "text-warning" : "text-muted-foreground")}>{num(r.errors)}</TableCell>
                  <TableCell className={cn(MONO, "text-right", r.serverErrors ? "text-destructive" : "text-muted-foreground")}>{num(r.serverErrors)}</TableCell>
                  <TableCell className={cn(MONO, "text-right", r.limited ? "text-warning" : "text-muted-foreground")}>{num(r.limited)}</TableCell>
                  <TableCell className={cn(MONO, "text-right text-muted-foreground")}>{num(r.activeDays)}</TableCell>
                  <TableCell className="text-right text-muted-foreground" title={when(r.firstSeenAt)}>
                    {ago(r.firstSeenAt, now)}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground" title={when(r.lastSeenAt)}>
                    {ago(r.lastSeenAt, now)}
                  </TableCell>
                  <TableCell className="max-w-56">
                    <span className="flex min-w-0 items-center gap-x-2 overflow-hidden" onClick={(e) => e.stopPropagation()}>
                      {r.users.slice(0, 3).map((u) => (
                        <UserLink key={u.id} id={u.id} name={u.username} />
                      ))}
                      {r.userCount > 3 && <span className={cn(MONO, "shrink-0 text-xs text-muted-foreground")}>+{num(r.userCount - 3)}</span>}
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
