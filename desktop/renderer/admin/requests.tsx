/** The request log, newest first: filters in a popover and in the address (important, kind, status, method, IP, path,
 * account, period), live while the socket brings traffic, older rows loaded with the `before` cursor. */
import { useEffect, useMemo, useState } from "react";
import { Flag, ListFilter, ListX, Radio } from "lucide-react";
import { navigate, useAdmin, useLiveState, useRoute, withParams, type LogRow, type Requests as Data } from "./api";
import { admin } from "./api";
import { Choose, Failure, IpLink, Kind, NUMERIC, adminScroll, num, TableSkeleton, Status, UserLink, VIEW, when } from "./parts";
import { VirtualList } from "../virtual";
import { Count, Empty, FOCUS, PageHead, SearchField, Tip } from "../base";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const LIMIT = 50;
const KINDS = ["rate-limit", "server-error", "auth", "admin", "account", "release", "client-error", "not-found", "sync", "live", "mobile", "api", "page", "asset"];
const RANGES: Record<string, number> = { "1h": 3600e3, "24h": 86400e3, "7d": 7 * 86400e3, "30d": 30 * 86400e3 };
const FILTERS = ["important", "kind", "status", "method", "ip", "path", "user", "range"] as const;

export function Requests({ phone }: { phone: boolean }) {
  const { params } = useRoute();
  const live = useLiveState();
  const [following, setFollowing] = useState(true);
  const value = (key: (typeof FILTERS)[number]) => params.get(key) ?? "";
  const set = (changes: Record<string, string | null>) => navigate(withParams(params, changes), true);
  const range = value("range");
  // The period's start moves with the live refreshes, not with every render.
  const from = useMemo(() => (RANGES[range] ? Math.floor((Date.now() - RANGES[range]!) / 1000) * 1000 : null), [range, following ? live.tick : 0]);
  const query = new URLSearchParams({ limit: String(LIMIT) });
  for (const key of FILTERS) if (key !== "range" && value(key)) query.set(key, value(key));
  if (from) query.set("from", String(from));
  const filterKey = FILTERS.map((k) => value(k)).join("|");
  const first = useAdmin<Data>("/requests?" + query, { tick: following ? live.tick : 0, keep: true });
  const [older, setOlder] = useState<{ key: string; rows: LogRow[]; done: boolean; loading: boolean; error: string }>({ key: filterKey, rows: [], done: false, loading: false, error: "" });
  useEffect(() => setOlder({ key: filterKey, rows: [], done: false, loading: false, error: "" }), [filterKey]);
  const d = first.data;
  const rows = useMemo(() => {
    const seen = new Set<number>();
    return [...(d?.rows ?? []), ...(older.key === filterKey ? older.rows : [])].filter((r) => !seen.has(r.id) && seen.add(r.id));
  }, [d, older, filterKey]);
  const more = async () => {
    const last = rows.at(-1);
    if (!last) return;
    setOlder((o) => ({ ...o, loading: true, error: "" }));
    const next = new URLSearchParams(query);
    next.set("before", String(last.id));
    try {
      const page = await admin<Data>("/requests?" + next);
      setOlder((o) => (o.key !== filterKey ? o : { key: filterKey, rows: [...o.rows, ...page.rows], done: page.rows.length < LIMIT, loading: false, error: "" }));
    } catch (error) {
      setOlder((o) => ({ ...o, loading: false, error: (error as Error).message }));
    }
  };
  const any = FILTERS.some((k) => value(k));
  const done = older.done || (d ? !d.totalCapped && rows.length >= d.total : false),
    total = d ? num(d.total) + (d.totalCapped ? "+" : "") : "";
  return (
    <div className={VIEW}>
      <PageHead title="Requests" sub={d ? `${total} ${any ? "matching" : "logged"} · newest first` : undefined}>
        <Toggle
          variant="outline"
          pressed={following}
          onPressedChange={setFollowing}
          aria-label="Follow new requests"
          data-action="requests:live"
        >
          <Radio className={cn(following && live.connected ? "text-success" : "text-muted-foreground")} />
          Live
        </Toggle>
        {/* The filters in a popover, the button counting those set. */}
        <Popover>
          <PopoverTrigger render={<Button variant="outline" data-action="requests:filters" />}>
            <ListFilter />
            Filter
            <Count n={FILTERS.filter((k) => value(k)).length} className="ml-0" />
          </PopoverTrigger>
          <PopoverContent align="end" className="flex w-72 flex-col gap-2 p-3" role="group" aria-label="Filters">
            <Toggle
              variant="outline"
              pressed={value("important") === "1"}
              onPressedChange={(on: boolean) => set({ important: on ? "1" : null })}
              data-action="requests:important"
              className="justify-start"
            >
              <Flag />
              Important
            </Toggle>
            <Choose
              label="Kind"
              action="requests:kind"
              value={value("kind") || "any"}
              onChange={(v) => set({ kind: v === "any" ? null : v })}
              options={[{ value: "any", label: "All kinds" }, ...(d?.kinds ?? KINDS).map((k) => ({ value: k, label: k }))]}
              className="w-full"
            />
            <Choose
              label="Status"
              action="requests:status"
              value={value("status") || "any"}
              onChange={(v) => set({ status: v === "any" ? null : v })}
              options={[
                { value: "any", label: "Any status" },
                { value: "error", label: "Errors (4xx, 5xx)" },
                { value: "2xx", label: "2xx" },
                { value: "3xx", label: "3xx" },
                { value: "4xx", label: "4xx" },
                { value: "5xx", label: "5xx" },
                { value: "401", label: "401" },
                { value: "404", label: "404" },
                { value: "429", label: "429" },
              ]}
              className="w-full"
            />
            <Choose
              label="Method"
              action="requests:method"
              value={value("method") || "any"}
              onChange={(v) => set({ method: v === "any" ? null : v })}
              options={[{ value: "any", label: "Any method" }, ...["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => ({ value: m, label: m }))]}
              className="w-full"
            />
            <Choose
              label="Period"
              action="requests:range"
              value={range || "any"}
              onChange={(v) => set({ range: v === "any" ? null : v })}
              options={[
                { value: "any", label: "Any time" },
                { value: "1h", label: "Last hour" },
                { value: "24h", label: "Last 24 h" },
                { value: "7d", label: "Last 7 days" },
                { value: "30d", label: "Last 30 days" },
              ]}
              className="w-full"
            />
            <SearchField value={value("ip")} onChange={(v) => set({ ip: v || null })} delay={300} placeholder="IP" numeric action="requests:ip" />
            <SearchField value={value("path")} onChange={(v) => set({ path: v || null })} delay={300} placeholder="Path" numeric action="requests:path" />
            <SearchField value={value("user")} onChange={(v) => set({ user: v || null })} delay={300} placeholder="Account" action="requests:user" />
            {any && (
              <Button variant="outline" onClick={() => navigate("/admin/requests", true)} data-action="requests:reset">
                Reset
              </Button>
            )}
          </PopoverContent>
        </Popover>
      </PageHead>
      <div className={cn("min-w-0", first.loading && d && !following && "opacity-70 transition-opacity")}>
        {first.error && !d ? (
          <Failure error={first.error} retry={first.reload} className="my-2" />
        ) : !d ? (
          <TableSkeleton cols={phone ? 2 : 7} rows={14} />
        ) : !rows.length ? (
          <Empty icon={ListX} title={any ? "No request matches these filters." : "No request logged yet."} />
        ) : phone ? (
          <ul className="flex flex-col" data-slot="requests-list">
            <VirtualList
              items={rows}
              scroller={adminScroll}
              estimate={62}
              spacerAs="li"
              rowKey={(r) => r.id}
              row={(r, _, measure) => (
                <li ref={measure} className="flex flex-col gap-1 border-b py-2.5 [&:nth-last-child(2)]:border-0">
                  <span className="flex min-w-0 items-center gap-2">
                    <Status status={r.status} />
                    <span className={cn(NUMERIC, "text-xs text-muted-foreground")}>{r.method}</span>
                    <span className={cn(NUMERIC, "min-w-0 flex-1 truncate text-sm")}>{r.path}</span>
                  </span>
                  <span className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                    <span className={NUMERIC}>{when(r.at, true)}</span>·<Kind kind={r.kind} important={r.important} />·
                    {r.userId ? <UserLink id={r.userId} name={r.username} /> : <IpLink ip={r.ip} />}
                    <span className={cn(NUMERIC, "ml-auto")}>{r.durationMs.toFixed(0)} ms</span>
                  </span>
                </li>
              )}
            />
          </ul>
        ) : (
          <Table data-slot="requests-table">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-40">Time</TableHead>
                <TableHead className="w-16">Status</TableHead>
                <TableHead>Request</TableHead>
                <TableHead className="w-28">Kind</TableHead>
                <TableHead className="w-20 text-right">Duration</TableHead>
                <TableHead className="w-36">Account</TableHead>
                <TableHead className="w-36">IP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <VirtualList
                items={rows}
                scroller={adminScroll}
                estimate={41}
                spacerAs="tr"
                rowKey={(r) => r.id}
                row={(r, _, measure) => (
                  <TableRow ref={measure}>
                    <TableCell className={cn(NUMERIC, "text-xs text-muted-foreground")}>
                      <Tip content={new Date(r.at).toLocaleString()}>
                        <span>{when(r.at, true)}</span>
                      </Tip>
                    </TableCell>
                    <TableCell>
                      <Status status={r.status} />
                    </TableCell>
                    <TableCell className="max-w-0 truncate">
                      <span className={cn(NUMERIC, "mr-2 text-xs text-muted-foreground")}>{r.method}</span>
                      {r.userAgent ? (
                        <Tip content={r.userAgent}>
                          <span className={NUMERIC}>{r.path}</span>
                        </Tip>
                      ) : (
                        <span className={NUMERIC}>{r.path}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Kind kind={r.kind} important={r.important} />
                    </TableCell>
                    <TableCell className={cn(NUMERIC, "text-right text-muted-foreground")}>{r.durationMs < 10 ? r.durationMs.toFixed(1) : r.durationMs.toFixed(0)} ms</TableCell>
                    <TableCell className="max-w-36 truncate">
                      <UserLink id={r.userId} name={r.username} />
                    </TableCell>
                    <TableCell className="max-w-36 truncate">
                      <Tip content={`Only ${r.ip}`}>
                        <button type="button" className={cn(NUMERIC, FOCUS, "max-w-full truncate rounded-sm text-left transition-colors hover:text-primary")} onClick={() => set({ ip: r.ip })}>
                          {r.ip}
                        </button>
                      </Tip>
                    </TableCell>
                  </TableRow>
                )}
              />
            </TableBody>
          </Table>
        )}
      </div>
      {d && rows.length > 0 && (
        <div className="flex items-center justify-between gap-3">
          <span className={cn(NUMERIC, "text-xs text-muted-foreground")}>
            {num(rows.length)} of {total}
          </span>
          {older.error && <span className="text-xs text-destructive">{older.error}</span>}
          {!done && (
            <Button variant="outline" onClick={more} disabled={older.loading} data-action="requests:more">
              {older.loading ? "Loading…" : "Load older"}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
