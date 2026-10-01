/** How a figure or a time is tinted: the same few meanings on the web and on Android. */
export type Tone = "" | "good" | "bad" | "accent" | "warning";

/** The text colour of each tone, as a Tailwind class (NativeWind reads the same names). */
export const TONE_TEXT: Record<Tone, string> = {
  "": "",
  good: "text-success",
  bad: "text-destructive",
  accent: "text-primary",
  warning: "text-warning",
};
