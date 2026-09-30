/** Daily charts of the administration: one y-axis each, bars for counts, a 2px line for a second series on the same
 * scale, the theme's chart colours, recessive axes and a tooltip on hover. */
import { Bar, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { cn } from "@/lib/utils";
import { compact, dayLabel, MONO, num } from "./parts";

export type Series = { key: string; label: string; color: string; kind?: "bar" | "line" };

/** A titled daily chart; its legend names the series once there are two. */
export function DailyChart({
  title,
  total,
  data,
  series,
  className,
  height = "h-36",
}: {
  title: string;
  total?: React.ReactNode;
  data: Record<string, any>[];
  series: Series[];
  className?: string;
  height?: string;
}) {
  const config = Object.fromEntries(series.map((s) => [s.key, { label: s.label, color: s.color }])) satisfies ChartConfig;
  return (
    <figure className={cn("flex min-w-0 flex-col gap-2", className)} data-chart-title={title}>
      <figcaption className="flex min-h-5 items-center gap-3">
        <span className="text-sm font-medium">{title}</span>
        {total != null && <span className={cn(MONO, "text-sm text-muted-foreground")}>{total}</span>}
        {series.length > 1 && (
          <span className="ml-auto flex items-center gap-3">
            {series.map((s) => (
              <span key={s.key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className={cn("shrink-0 rounded-[2px]", s.kind === "line" ? "h-0.5 w-3" : "size-2")} style={{ background: s.color }} />
                {s.label}
              </span>
            ))}
          </span>
        )}
      </figcaption>
      <ChartContainer config={config} className={cn("aspect-auto w-full", height)}>
        <ComposedChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }} barCategoryGap="18%">
          <CartesianGrid vertical={false} strokeOpacity={0.5} />
          <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={6} minTickGap={28} tickFormatter={dayLabel} fontSize={11} />
          <YAxis width={34} tickLine={false} axisLine={false} allowDecimals={false} tickCount={3} tickFormatter={(v: number) => compact(v)} fontSize={11} />
          <ChartTooltip
            cursor={{ fillOpacity: 0.5 }}
            content={
              <ChartTooltipContent
                labelFormatter={(_, payload) => (payload?.[0] ? dayLabel(payload[0].payload.day) : "")}
                formatter={(value, name, item) => <TooltipRow value={Number(value)} label={config[String(name)]?.label ?? String(name)} color={item.color} />}
              />
            }
          />
          {series.map((s) =>
            s.kind === "line" ? (
              <Line key={s.key} dataKey={s.key} type="linear" stroke={`var(--color-${s.key})`} strokeWidth={2} dot={false} isAnimationActive={false} />
            ) : (
              <Bar key={s.key} dataKey={s.key} fill={`var(--color-${s.key})`} radius={[3, 3, 0, 0]} maxBarSize={18} isAnimationActive={false} />
            ),
          )}
        </ComposedChart>
      </ChartContainer>
    </figure>
  );
}

function TooltipRow({ value, label, color }: { value: number; label: React.ReactNode; color?: string }) {
  return (
    <div className="flex w-full items-center gap-2">
      <span className="size-2 shrink-0 rounded-[2px]" style={{ background: color }} />
      <span className="text-muted-foreground">{label}</span>
      <span className={cn(MONO, "ml-auto pl-3 font-medium text-foreground")}>{num(value)}</span>
    </div>
  );
}
