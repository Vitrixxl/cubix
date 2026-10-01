/** The administration's shared pieces: formats, figures, badges, links, sortable headers, pagination, skeletons and
 * inline errors. */
import { ArrowDown, ArrowUp, ChevronsUpDown, RotateCw, TriangleAlert, X } from "lucide-react";
import { eventLabel, type PuzzleId, type SolveMode } from "../../../src/shared/puzzles";
import { AdminError, navigate, withParams } from "./api";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TableHead } from "@/components/ui/table";
import { Pagination, PaginationContent, PaginationItem, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { useEffect, useState } from "react";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Figure, NUMERIC } from "../base";

export { Avatar, NUMERIC, SectionHead } from "../base";

/* Formats. Every time is in ms since the epoch; days are UTC. */
export const num = (n: number | null | undefined) => (n == null ? "–" : n.toLocaleString("en-US"));
export function compact(n: number) {
  if (Math.abs(n) < 10000) return num(n);
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}
export function bytes(n: number | null | undefined) {
  if (n == null) return "–";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0,
    v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}
export function span(ms: number) {
  const m = Math.floor(ms / 60000),
    h = Math.floor(m / 60),
    d = Math.floor(h / 24);
  if (d) return `${d} d ${h % 24} h`;
  if (h) return `${h} h ${m % 60} min`;
  return `${m} min`;
}
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
export function when(at: number | null | undefined, seconds = false) {
  if (at == null) return "–";
  const d = new Date(at),
    time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", ...(seconds ? { second: "2-digit" } : {}) });
  if (sameDay(d, new Date())) return time;
  return `${d.toLocaleDateString("en-US", { day: "numeric", month: "short", ...(d.getFullYear() !== new Date().getFullYear() ? { year: "numeric" } : {}) })} ${time}`;
}
export function date(at: number | null | undefined) {
  if (at == null) return "–";
  const d = new Date(at);
  return d.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
}
export function ago(at: number | null | undefined, now = Date.now()) {
  if (at == null) return "never";
  const s = Math.max(0, (now - at) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} d ago`;
  return date(at);
}
export const dayLabel = (day: string) => new Date(day + "T00:00:00Z").toLocaleDateString("en-US", { day: "numeric", month: "short", timeZone: "UTC" });
export function event(puzzle: string, mode: string) {
  try {
    return eventLabel(puzzle as PuzzleId, mode as SolveMode);
  } catch {
    return `${puzzle} · ${mode}`;
  }
}

/** Re-renders every 30 s so "5 min ago" stays true. */
export function useNow() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/** A key figure: the label, the value in Geist, one quiet line under it (a breakdown or the change since yesterday). */
export function Kpi({ label, value, sub, delta, invert = false, className }: { label: string; value: React.ReactNode; sub?: React.ReactNode; delta?: number | null; invert?: boolean; className?: string }) {
  return (
    <Figure
      label={label}
      value={value}
      caption="strong"
      size="2xl"
      aside={
        delta != null && (
          <span className="text-xs" title="Since yesterday">
            <Delta value={delta} invert={invert} />
          </span>
        )
      }
      sub={sub}
      className={className}
    />
  );
}
/** The change since yesterday: an arrow and the difference, red only when it goes the wrong way. */
export function Delta({ value, invert = false }: { value: number; invert?: boolean }) {
  if (!value) return <span className={cn(NUMERIC, "text-muted-foreground")}>±0</span>;
  const bad = invert ? value > 0 : value < 0;
  const I = value > 0 ? ArrowUp : ArrowDown;
  return (
    <span className={cn(NUMERIC, "inline-flex items-center gap-0.5", bad ? "text-destructive" : "text-foreground/80")}>
      <I className="size-3" />
      {num(Math.abs(value))}
    </span>
  );
}

/** HTTP status: 2xx and 3xx muted, 4xx amber, 5xx red. */
export function Status({ status }: { status: number }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        NUMERIC,
        "rounded-sm border-transparent px-1.5",
        status >= 500 ? "bg-destructive/15 text-destructive" : status >= 400 ? "bg-warning/15 text-warning" : "bg-muted text-muted-foreground",
      )}
    >
      {status}
    </Badge>
  );
}
export function Kind({ kind, important }: { kind: string; important?: boolean }) {
  return <span className={cn("text-xs", important ? "font-medium text-foreground" : "text-muted-foreground")}>{kind}</span>;
}
/** A guest account, beside its name. */
export function GuestTag() {
  return (
    <Badge variant="secondary" className="h-4.5 rounded-sm px-1 text-[10px] font-normal text-muted-foreground">
      guest
    </Badge>
  );
}

/** In-app links: a real address (middle click opens a tab), followed without reloading. */
export function Link({ to, children, className, title }: { to: string; children: React.ReactNode; className?: string; title?: string }) {
  return (
    <a
      href={to}
      title={title}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        navigate(to);
      }}
      className={cn("min-w-0 truncate rounded-sm outline-none transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-ring/50", className)}
    >
      {children}
    </a>
  );
}
export const userPath = (id: string) => `/admin/users/${encodeURIComponent(id)}`;
export const ipPath = (ip: string) => `/admin/requests?ip=${encodeURIComponent(ip)}`;
export function UserLink({ id, name, guest }: { id: string | null; name: string | null; guest?: boolean }) {
  if (!id) return <span className="text-muted-foreground">–</span>;
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <Link to={userPath(id)}>{name ?? id.slice(0, 8)}</Link>
      {guest && <GuestTag />}
    </span>
  );
}
export function IpLink({ ip, className }: { ip: string; className?: string }) {
  return (
    <Link to={ipPath(ip)} title={`Requests from ${ip}`} className={cn(NUMERIC, className)}>
      {ip}
    </Link>
  );
}

/** A column header that sorts: the first click takes the column's natural order, the next reverses it. */
export function SortHead({
  id,
  label,
  sort,
  order,
  params,
  defaultOrder = "desc",
  className,
}: {
  id: string;
  label: string;
  sort: string;
  order: string;
  params: URLSearchParams;
  defaultOrder?: "asc" | "desc";
  className?: string;
}) {
  const active = sort === id;
  const next = active ? (order === "asc" ? "desc" : "asc") : defaultOrder;
  const I = !active ? ChevronsUpDown : order === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableHead className={className} aria-sort={active ? (order === "asc" ? "ascending" : "descending") : undefined}>
      <button
        type="button"
        data-action={"sort:" + id}
        onClick={() => navigate(withParams(params, { sort: id, order: next, page: null }), true)}
        className={cn(
          "-mx-1 inline-flex items-center gap-1 rounded-sm px-1 outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50",
          "text-foreground",
          className?.includes("text-right") && "flex-row-reverse",
        )}
      >
        {label}
        <I className={cn("size-3", !active && "opacity-50")} />
      </button>
    </TableHead>
  );
}

/** "1–50 of 312" and the previous / next pages. */
export function Pager({ page, limit, total, params }: { page: number; limit: number; total: number; params: URLSearchParams }) {
  const pages = Math.max(1, Math.ceil(total / limit));
  const first = total ? page * limit + 1 : 0,
    last = Math.min(total, (page + 1) * limit);
  const link = (p: number) => withParams(params, { page: p || null });
  const go = (p: number) => (e: React.MouseEvent) => {
    e.preventDefault();
    if (p >= 0 && p < pages) navigate(link(p), true);
  };
  return (
    <div className="flex shrink-0 items-center justify-between gap-3 pt-3">
      <span className={cn(NUMERIC, "text-xs text-muted-foreground")}>
        {num(first)}–{num(last)} of {num(total)}
      </span>
      <Pagination className="mx-0 w-auto">
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious href={link(Math.max(0, page - 1))} onClick={go(page - 1)} aria-disabled={page <= 0} className={cn(page <= 0 && "pointer-events-none opacity-40")} />
          </PaginationItem>
          <PaginationItem>
            <span className={cn(NUMERIC, "px-2 text-xs text-muted-foreground")}>
              {page + 1} / {pages}
            </span>
          </PaginationItem>
          <PaginationItem>
            <PaginationNext href={link(Math.min(pages - 1, page + 1))} onClick={go(page + 1)} aria-disabled={page >= pages - 1} className={cn(page >= pages - 1 && "pointer-events-none opacity-40")} />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  );
}

/** A failed load, where the data would be: what went wrong and a retry. */
export function Failure({ error, retry, className }: { error: AdminError | Error; retry: () => void; className?: string }) {
  return (
    <div role="alert" className={cn("flex items-center gap-3 rounded-lg bg-destructive/8 px-3 py-2.5 text-sm", className)}>
      <TriangleAlert className="size-4 shrink-0 text-destructive" />
      <span className="min-w-0 flex-1">{error.message}</span>
      <Button variant="outline" size="sm" onClick={retry} data-action="retry">
        <RotateCw />
        Retry
      </Button>
    </div>
  );
}

/** Rows of a table on their way, shaped like its columns. */
export function RowsSkeleton({ rows = 10, cols = 6, className }: { rows?: number; cols?: number; className?: string }) {
  return (
    <div className={cn("flex flex-col", className)} aria-busy="true" aria-label="Loading">
      <div className="flex h-9 items-center gap-4 border-b">
        {Array.from({ length: cols }, (_, i) => (
          <Skeleton key={i} className={cn("h-3", i === 0 ? "w-32" : "w-16", i > 0 && "ml-auto")} />
        ))}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex h-11 items-center gap-4 border-b last:border-0">
          {Array.from({ length: cols }, (_, i) => (
            <Skeleton key={i} className={cn("h-3.5", i === 0 ? "w-40" : "w-12", i > 0 && "ml-auto")} />
          ))}
        </div>
      ))}
    </div>
  );
}
export function FiguresSkeleton({ count = 6, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("grid gap-6", className)} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex flex-col gap-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-6 w-16" />
          <Skeleton className="h-3 w-24" />
        </div>
      ))}
    </div>
  );
}

/** The page's title row: the title, one line under it, the view's controls on the right. */
export function ViewHead({ title, sub, lead, children }: { title: React.ReactNode; sub?: React.ReactNode; lead?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <header className="flex min-h-10 shrink-0 items-center justify-between gap-x-6">
      <div className="flex min-w-0 items-center gap-3">
        {lead}
        <div className="flex min-w-0 items-baseline gap-2 md:gap-3">
          <h1 className="max-w-full min-w-0 shrink-0 truncate text-xl font-semibold tracking-tight md:text-2xl">{title}</h1>
          {sub && <p className="min-w-0 truncate text-xs text-muted-foreground md:text-sm">{sub}</p>}
        </div>
      </div>
      {children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
    </header>
  );
}

/** An empty list, said plainly. */
export function Nothing({ children }: { children: React.ReactNode }) {
  return <p className="py-8 text-center text-sm text-muted-foreground">{children}</p>;
}

/** One choice among a few, in a select showing the chosen label. */
export function Choose({ value, options, onChange, label, action, className }: { value: string; options: { value: string; label: string }[]; onChange: (value: string) => void; label: string; action?: string; className?: string }) {
  return (
    <Select items={options} value={value} onValueChange={(v) => onChange(String(v))}>
      <SelectTrigger aria-label={label} data-action={action} className={className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** A text filter: applied a moment after typing stops, cleared with its ×. */
export function FilterInput({ value, onCommit, placeholder, icon, className, action, numeric = false }: { value: string; onCommit: (value: string) => void; placeholder: string; icon?: React.ReactNode; className?: string; action?: string; numeric?: boolean }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  useEffect(() => {
    if (text.trim() === value) return;
    const id = setTimeout(() => onCommit(text.trim()), 300);
    return () => clearTimeout(id);
  }, [text]);
  return (
    <InputGroup className={className}>
      {icon && <InputGroupAddon>{icon}</InputGroupAddon>}
      <InputGroupInput value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} aria-label={placeholder} data-action={action} className={cn(numeric && text && NUMERIC)} spellCheck={false} />
      {text && (
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            size="icon-xs"
            aria-label={"Clear " + placeholder.toLowerCase()}
            onClick={() => {
              setText("");
              onCommit("");
            }}
          >
            <X />
          </InputGroupButton>
        </InputGroupAddon>
      )}
    </InputGroup>
  );
}
