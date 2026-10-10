/** The timer curve's legend: its series named beside it, each after its swatch. */
import { said } from "../ui";
import { cn } from "@/lib/utils";

/** The series of a chart named beside it, each after its swatch: a line's colour, or a bar's tone. */
export function Legend({ series, className }: { series: [label: string, swatch: string][]; className?: string }) {
  return (
    <span className={cn("flex items-center gap-4 text-xs font-semibold text-muted-foreground", className)}>
      {series.map(([label, swatch]) => (
        <span key={label} className="flex items-center gap-1.5">
          <span className={cn("rounded-full", swatch)} />
          {said(label)}
        </span>
      ))}
    </span>
  );
}

/** The curve's two series, the singles and their Ao5, and the marks on its fastest and slowest singles. */
export const TrendLegend = ({ className }: { className?: string }) => (
  <Legend
    className={className}
    series={[
      ["Single", "h-0.5 w-3 bg-chart-1"],
      ["Ao5", "h-0.5 w-3 bg-chart-2"],
      ["Best", "size-2 bg-success"],
      ["Worst", "size-2 bg-destructive"],
    ]}
  />
);
