/** Every account: searchable, filtered (registered / guests), sorted and paged; a row opens the account. */
import { useEffect, useState } from "react";
import { ChevronRight, Search } from "lucide-react";
import { listUrl, navigate, useAdmin, useRoute, withParams, type Users as Data } from "./api";
import { ago, date, Failure, GuestTag, Initials, MONO, Nothing, num, Pager, ROW_LINK, RowsSkeleton, SortHead, useNow, userPath, ViewHead, when } from "./parts";
import { cn } from "@/lib/utils";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const LIMIT = 50;

export function Users({ phone }: { phone: boolean }) {
  const { params } = useRoute();
  const q = params.get("q") ?? "",
    filter = params.get("filter") ?? "all",
    sort = params.get("sort") ?? "created",
    order = params.get("order") ?? (sort === "username" ? "asc" : "desc"),
    page = Number(params.get("page") ?? 0) || 0;
  const [text, setText] = useState(q);
  useEffect(() => setText(q), [q]);
  // The search follows typing after a short pause.
  useEffect(() => {
    if (text === q) return;
    const id = setTimeout(() => navigate(withParams(params, { q: text.trim(), page: null }), true), 250);
    return () => clearTimeout(id);
  }, [text]);
  const query = new URLSearchParams({ q, filter, sort, order, page: String(page), limit: String(LIMIT) });
  const users = useAdmin<Data>("/users?" + query, { keep: true });
  const d = users.data;
  const now = useNow();
  const open = (id: string) => {
    listUrl.users = location.pathname + location.search;
    navigate(userPath(id));
  };
  return (
    <div className="flex flex-col gap-5">
      <ViewHead title="Users" sub={d ? `${num(d.counts.all)} accounts · ${num(d.counts.registered)} registered · ${num(d.counts.guests)} guests` : "Every account"} />
      <div className="flex flex-wrap items-center gap-2">
        <InputGroup className="w-full sm:w-72">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput value={text} onChange={(e) => setText(e.target.value)} placeholder="Username or id" aria-label="Search accounts" data-action="users:search" />
        </InputGroup>
        <ToggleGroup
          variant="outline"
          value={[filter]}
          onValueChange={(v: string[]) => v[0] && navigate(withParams(params, { filter: v[0] === "all" ? null : v[0], page: null }), true)}
          aria-label="Accounts"
        >
          {(["all", "registered", "guests"] as const).map((id) => (
            <ToggleGroupItem key={id} value={id} data-action={"users:filter:" + id} className="gap-1.5 px-3">
              {id === "all" ? "All" : id === "registered" ? "Registered" : "Guests"}
              {d && <span className={cn(MONO, "text-xs text-muted-foreground")}>{num(d.counts[id])}</span>}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      <div className={cn("min-w-0", users.loading && d && "opacity-70 transition-opacity")}>
        {users.error && !d ? (
          <Failure error={users.error} retry={users.reload} className="my-2" />
        ) : !d ? (
          <RowsSkeleton cols={phone ? 2 : 8} rows={12} />
        ) : !d.rows.length ? (
          <Nothing>{q ? `No account matches “${q}”.` : "No account yet."}</Nothing>
        ) : phone ? (
          <ul className="flex flex-col" data-slot="users-list">
            {d.rows.map((u) => (
              <li key={u.id}>
                <button type="button" onClick={() => open(u.id)} className="flex w-full items-center gap-3 border-b py-3 text-left last:border-0">
                  <Initials name={u.username} size={32} />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex items-center gap-1.5 truncate font-medium">
                      {u.username} {u.isGuest && <GuestTag />}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {num(u.solves7d)} / {num(u.solves)} solves · seen {ago(u.lastSeenAt, now)}
                    </span>
                  </span>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <Table data-slot="users-table">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <SortHead id="username" label="Account" sort={sort} order={order} params={params} defaultOrder="asc" />
                <SortHead id="created" label="Created" sort={sort} order={order} params={params} />
                <SortHead id="lastSeen" label="Last seen" sort={sort} order={order} params={params} />
                <SortHead id="solves" label="Solves 7 d / all" sort={sort} order={order} params={params} className="text-right" />
                <TableHead className="text-right">Learned</TableHead>
                <TableHead className="text-right">Duels</TableHead>
                <TableHead className="text-right">Sessions</TableHead>
                <TableHead className="text-right">Last solve</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {d.rows.map((u) => (
                <TableRow key={u.id} className={ROW_LINK} onClick={() => open(u.id)} data-user={u.username}>
                  <TableCell className="max-w-64">
                    <span className="flex min-w-0 items-center gap-2.5">
                      <Initials name={u.username} size={24} />
                      <a
                        href={userPath(u.id)}
                        onClick={(e) => e.preventDefault()}
                        className="truncate font-medium outline-none focus-visible:text-primary"
                      >
                        {u.username}
                      </a>
                      {u.isGuest && <GuestTag />}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground" title={when(u.createdAt)}>
                    {date(u.createdAt)}
                  </TableCell>
                  <TableCell className="text-muted-foreground" title={u.lastSeenAt ? when(u.lastSeenAt) : undefined}>
                    {ago(u.lastSeenAt, now)}
                  </TableCell>
                  <TableCell className={cn(MONO, "text-right")}>
                    {num(u.solves7d)} <span className="text-muted-foreground">/ {num(u.solves)}</span>
                  </TableCell>
                  <TableCell className={cn(MONO, "text-right")}>{num(u.learnedCases)}</TableCell>
                  <TableCell className={cn(MONO, "text-right")}>{num(u.duels)}</TableCell>
                  <TableCell className={cn(MONO, "text-right")}>{num(u.activeSessions)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{u.lastSolveAt ? ago(u.lastSolveAt, now) : "–"}</TableCell>
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
