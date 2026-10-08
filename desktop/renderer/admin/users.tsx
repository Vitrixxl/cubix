/** Every account: searchable, filtered (registered / guests), sorted and paged; a row opens the account. */
import { ChevronRight, UserX } from "lucide-react";
import { listUrl, navigate, useAdmin, useRoute, withParams, type Users as Data } from "./api";
import { ago, date, Failure, GuestTag, Avatar, NUMERIC, num, Pager, TableSkeleton, SortHead, useNow, userPath, VIEW, when } from "./parts";
import { Empty, FOCUS, PageHead, ROW, SearchField, Segmented, Tip } from "../base";
import { cn } from "@/lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const LIMIT = 50;

export function Users({ phone }: { phone: boolean }) {
  const { params } = useRoute();
  const q = params.get("q") ?? "",
    filter = params.get("filter") ?? "all",
    sort = params.get("sort") ?? "created",
    order = params.get("order") ?? (sort === "username" ? "asc" : "desc"),
    page = Number(params.get("page") ?? 0) || 0;
  const query = new URLSearchParams({ q, filter, sort, order, page: String(page), limit: String(LIMIT) });
  const users = useAdmin<Data>("/users?" + query, { keep: true });
  const d = users.data;
  const now = useNow();
  const open = (id: string) => {
    listUrl.users = location.pathname + location.search;
    navigate(userPath(id));
  };
  return (
    <div className={VIEW}>
      <PageHead title="Users" sub={d ? `${num(d.counts.all)} accounts · ${num(d.counts.registered)} registered · ${num(d.counts.guests)} guests` : "Every account"} />
      <div className="flex flex-wrap items-center gap-2">
        <SearchField
          value={q}
          onChange={(v) => navigate(withParams(params, { q: v, page: null }), true)}
          delay={300}
          placeholder="Username or id"
          label="Search accounts"
          action="users:search"
          className="w-full sm:w-72"
        />
        <Segmented
          label="Accounts"
          action="users:filter:"
          value={filter}
          onChange={(id) => navigate(withParams(params, { filter: id === "all" ? null : id, page: null }), true)}
          options={(["all", "registered", "guests"] as const).map((id) => ({ id, label: id === "all" ? "All" : id === "registered" ? "Registered" : "Guests", count: d?.counts[id] }))}
        />
      </div>
      <div className={cn("min-w-0", users.loading && d && "opacity-70 transition-opacity")}>
        {users.error && !d ? (
          <Failure error={users.error} retry={users.reload} className="my-2" />
        ) : !d ? (
          <TableSkeleton cols={phone ? 2 : 8} rows={12} />
        ) : !d.rows.length ? (
          <Empty icon={UserX} title={q ? `No account matches “${q}”.` : "No account yet."} />
        ) : phone ? (
          <ul className="flex flex-col gap-0.5" data-slot="users-list">
            {d.rows.map((u) => (
              <li key={u.id}>
                <button type="button" onClick={() => open(u.id)} className={cn(ROW, "flex w-full items-center gap-3 px-2 py-2.5")}>
                  <Avatar name={u.username} size={32} />
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
                <TableRow key={u.id} className="cursor-pointer" onClick={() => open(u.id)} data-user={u.username}>
                  <TableCell className="max-w-64">
                    <span className="flex min-w-0 items-center gap-2.5">
                      <Avatar name={u.username} size={24} />
                      <a
                        href={userPath(u.id)}
                        onClick={(e) => e.preventDefault()}
                        className={cn(FOCUS, "truncate rounded-sm font-medium")}
                      >
                        {u.username}
                      </a>
                      {u.isGuest && <GuestTag />}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    <Tip content={when(u.createdAt)}>
                      <span>{date(u.createdAt)}</span>
                    </Tip>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {u.lastSeenAt ? (
                      <Tip content={when(u.lastSeenAt)}>
                        <span>{ago(u.lastSeenAt, now)}</span>
                      </Tip>
                    ) : (
                      ago(u.lastSeenAt, now)
                    )}
                  </TableCell>
                  <TableCell className={cn(NUMERIC, "text-right")}>
                    {num(u.solves7d)} <span className="text-muted-foreground">/ {num(u.solves)}</span>
                  </TableCell>
                  <TableCell className={cn(NUMERIC, "text-right")}>{num(u.learnedCases)}</TableCell>
                  <TableCell className={cn(NUMERIC, "text-right")}>{num(u.duels)}</TableCell>
                  <TableCell className={cn(NUMERIC, "text-right")}>{num(u.activeSessions)}</TableCell>
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
