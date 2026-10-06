/**
 * "Everything it does", as a bento grid: the two features people use most in large cards with their details, the
 * others smaller beside them. A soft light follows the pointer across the grid, lighting the edges it passes.
 */
import { BookOpen, ChartLine, Check, Library, MonitorSmartphone, Repeat, Swords, Timer, Video, type LucideIcon } from "lucide-react";
import { FEATURES } from "./content";
import { tr } from "../../../src/client/i18n";
import { said } from "../base";
import { cn } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = {
  timer: Timer,
  algorithms: Library,
  training: Repeat,
  learn: BookOpen,
  duel: Swords,
  stats: ChartLine,
  coaching: Video,
  everywhere: MonitorSmartphone,
};

export function Features() {
  return (
    <section id="details" className="mx-auto flex w-full max-w-7xl scroll-mt-8 flex-col gap-10 px-5 py-20 md:px-8 md:py-28">
      <h2 className="text-4xl leading-none font-semibold tracking-tight md:text-6xl">{tr("Everything it does")}</h2>
      <div
        className="group/grid grid gap-3 md:grid-cols-6"
        onPointerMove={(e) => {
          for (const card of e.currentTarget.children as HTMLCollectionOf<HTMLElement>) {
            const r = card.getBoundingClientRect();
            card.style.setProperty("--x", `${e.clientX - r.left}px`);
            card.style.setProperty("--y", `${e.clientY - r.top}px`);
          }
        }}
      >
        {FEATURES.map((f, i) => {
          const Icon = ICONS[f.id] ?? Check,
            big = i < 2;
          return (
            <article
              key={f.id}
              id={f.id}
              className={cn(
                "relative overflow-hidden rounded-3xl bg-border/60 p-px",
                big ? "md:col-span-3" : "md:col-span-3 lg:col-span-2",
              )}
            >
              {/* The edge, lit where the pointer is near. */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover/grid:opacity-100"
                style={{ background: "radial-gradient(400px circle at var(--x) var(--y), color-mix(in oklab, var(--primary) 70%, transparent), transparent 40%)" }}
              />
              <div className="relative flex h-full flex-col gap-4 rounded-[calc(1.5rem-1px)] bg-card p-6 md:p-8">
                {/* The inside, warmed a little by the same light. */}
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 transition-opacity duration-500 group-hover/grid:opacity-100"
                  style={{ background: "radial-gradient(500px circle at var(--x) var(--y), color-mix(in oklab, var(--primary) 7%, transparent), transparent 40%)" }}
                />
                <span className="relative flex size-11 items-center justify-center rounded-xl border bg-background/60 text-primary">
                  <Icon className="size-5" />
                </span>
                <h3 className={cn("relative font-semibold tracking-tight text-balance", big ? "text-2xl md:text-3xl" : "text-xl")}>{said(f.title)}</h3>
                <p className="relative max-w-[52ch] leading-relaxed text-muted-foreground">{said(f.summary)}</p>
                {big && (
                  <ul className="relative mt-auto flex flex-col gap-2 border-t pt-5 text-sm text-muted-foreground">
                    {f.points.slice(0, 3).map((point) => (
                      <li key={point} className="flex gap-2.5">
                        <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                        <span>{said(point)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
