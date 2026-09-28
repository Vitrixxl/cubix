import { memo, useEffect, useState, type ReactNode } from "react";
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type PressableProps, type StyleProp, type TextInputProps, type TextStyle, type ViewStyle } from "react-native";
import { FONT, useTheme, type Theme } from "../theme";
import { IconBack, IconCheck, IconChevronDown, IconMinus, IconNext, type Icon } from "./icons";

/**
 * Shared primitives mirroring the web stylesheet (desktop/renderer/styles.css, `.is-mobile` rules):
 * `.button`, `.control`, `.segmented`, `.label`, `.metric(s)`, `.page-head`, `.mark`, `.tag`, `.checkbox`,
 * `.progress`, `.skeleton-line`, inputs and flat rows. Flat, 1px `t.line` borders, 8–12 px radii, Geist.
 * Every `<Text>` is Geist already (src/fonts.ts); use `fontFamily: FONT.mono` (or `mono()`) for figures and moves.
 */

/** Text colour of a tone, as `.metric.tone-*` / `.good` / `.danger` / `.accent`. */
export type Tone = "good" | "bad" | "danger" | "accent" | "muted";
export function toneColor(t: Theme, tone: Tone | undefined, fallback = t.text): string {
  return tone === "good" ? t.good : tone === "bad" || tone === "danger" ? t.danger : tone === "accent" ? t.accent : tone === "muted" ? t.muted : fallback;
}

/** An icon given as a component (`IconUndo`) is drawn at `size` in `color`; an element is used as is. */
function renderIcon(icon: Icon | ReactNode, size: number, color: string): ReactNode {
  if (typeof icon === "function") { const I = icon as Icon; return <I size={size} color={color} />; }
  return icon as ReactNode;
}

export type ButtonVariant = "control" | "primary" | "ghost" | "soft" | "default";
export type ButtonProps = Omit<PressableProps, "style" | "children"> & {
  children?: ReactNode;
  /** An icon component (`IconUndo`, drawn 15 px, muted then text when active) or any element. */
  icon?: Icon | ReactNode;
  label?: string;
  /**
   * `control` (default, alias `default`): `.control`, 32 px, 1px line border, text colour.
   * `primary`: `.button.primary`, accent fill, white semibold label.
   * `ghost`: plain `.button`, transparent, secondary text, hover fill while pressed.
   * `soft`: `.soft`, surface3 fill.
   */
  variant?: ButtonVariant;
  /** Selected state (`.active`): surface3 fill, no border. `pressed` is the older name. */
  active?: boolean; pressed?: boolean;
  /** 28 px high (`.column-head .control`). `size` sets any other height (30 for solve actions and settings). */
  small?: boolean; size?: number;
  /** Square button holding only its icon. */
  iconOnly?: boolean;
  /** Colours label and icon: `good` (`.is-learned`), `danger`, `accent`. */
  tone?: Tone;
  /** Label in Geist Mono (`.solve-actions .control`: +2, DNF). */
  mono?: boolean;
  /** Trailing chevron, for menu triggers. */
  chevron?: boolean;
  style?: StyleProp<ViewStyle>; textStyle?: StyleProp<TextStyle>;
};
/** `.button` / `.control` / `.button.primary`: the app's only button. */
export function Btn({ children, icon, label, variant = "control", active, pressed, small, size, iconOnly, tone, mono: monoLabel, chevron, style, textStyle, disabled, ...rest }: ButtonProps) {
  const t = useTheme();
  const [down, setDown] = useState(false);
  const selected = active ?? pressed ?? false;
  const kind = variant === "default" ? "control" : variant;
  const height = size ?? (small ? 28 : 32);
  let background = "transparent", border = "transparent", color = t.text, iconColor = t.muted;
  if (kind === "primary") { background = down ? t.accentPressed : t.accent; color = "#fff"; iconColor = "#fff"; }
  else if (selected) { background = t.surface3; iconColor = t.text; }
  else if (kind === "soft") { background = down ? t.surface3Hover : t.surface3; iconColor = t.text; }
  else if (kind === "ghost") { background = down ? t.hover : "transparent"; color = down ? t.text : t.secondary; iconColor = down ? t.text : t.muted; }
  else { border = t.line; background = down ? t.hover : "transparent"; if (down) iconColor = t.text; }
  if (tone && kind !== "primary") { color = toneColor(t, tone); iconColor = color; }
  return <Pressable {...rest} disabled={disabled} accessibilityRole={rest.accessibilityRole ?? "button"} accessibilityState={rest.accessibilityState ?? (selected ? { selected: true } : undefined)}
    onPressIn={e => { setDown(true); rest.onPressIn?.(e); }} onPressOut={e => { setDown(false); rest.onPressOut?.(e); }}
    style={[styles.btn, kind === "control" && styles.control, { height, minHeight: height, backgroundColor: background, borderColor: border, opacity: disabled ? 0.35 : 1 }, iconOnly && { width: height, paddingHorizontal: 0 }, style]}>
    {icon !== undefined && renderIcon(icon, small ? 14 : 15, iconColor)}
    {label !== undefined && <Text numberOfLines={1} style={[styles.btnText, kind === "primary" && { fontWeight: "600" }, monoLabel && { fontFamily: FONT.mono, fontSize: 12.5 }, small && { fontSize: 12 }, { color }, textStyle]}>{label}</Text>}
    {children}
    {chevron && <IconChevronDown size={12} color={t.muted} />}
  </Pressable>;
}
/** `.control`: a bordered header/pane control (menus, toggles, small actions). Same props as `Btn`. */
export const Control = (props: Omit<ButtonProps, "variant">) => <Btn {...props} variant="control" />;
/** `.control-gap`-free horizontal group of controls with the web's 6 px gap. */
export function Controls({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.controls, style]}>{children}</View>;
}

/** `.button.times-action`: 24 px compact action of a times row (+2, DNF, delete, info); `on` = active. */
export function MiniBtn({ children, icon, label, on, danger, style, disabled, ...rest }: Omit<PressableProps, "style" | "children"> & { children?: ReactNode; icon?: Icon | ReactNode; label?: string; on?: boolean; danger?: boolean; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  const [down, setDown] = useState(false);
  const color = on ? t.text : danger && down ? t.danger : down ? t.text : t.muted;
  return <Pressable {...rest} disabled={disabled} hitSlop={6} onPressIn={e => { setDown(true); rest.onPressIn?.(e); }} onPressOut={e => { setDown(false); rest.onPressOut?.(e); }}
    style={[styles.miniBtn, !label && !children && styles.miniIcon, { backgroundColor: on ? t.surface3 : down ? t.hover : "transparent", opacity: disabled ? 0.35 : 1 }, style]}>
    {icon !== undefined && renderIcon(icon, 13, color)}
    {label !== undefined && <Text style={[styles.miniText, { color }]}>{label}</Text>}
    {children}
  </Pressable>;
}

export interface SegmentOption<T extends string> { id: T; label: string; count?: number; icon?: Icon | ReactNode }
/**
 * `.segmented`: bordered track (radius 9, 2 px inset) of 26 px items; the active one is surface3.
 * `plain` drops the track for a row of 32 px `.button`s (stage tabs); `scroll` lets a long row scroll sideways.
 */
export function Segmented<T extends string>({ options, value, onChange, small, disabled, plain, scroll, style, itemStyle, textStyle }: {
  options: SegmentOption<T>[]; value: T; onChange: (value: T) => void; small?: boolean; disabled?: boolean;
  plain?: boolean; scroll?: boolean; style?: StyleProp<ViewStyle>; itemStyle?: StyleProp<ViewStyle>; textStyle?: StyleProp<TextStyle>;
}) {
  const t = useTheme();
  void small;
  const items = options.map(option => {
    const active = option.id === value;
    const color = active ? t.text : t.secondary;
    return <Pressable key={option.id} disabled={disabled} accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={() => onChange(option.id)}
      style={({ pressed }) => [plain ? styles.tab : styles.segment, { backgroundColor: active ? t.surface3 : pressed ? t.hover : "transparent", opacity: disabled ? 0.35 : 1 }, itemStyle]}>
      {option.icon !== undefined && renderIcon(option.icon, 14, active ? t.text : t.muted)}
      <Text numberOfLines={1} style={[plain ? styles.tabText : styles.segmentText, { color }, textStyle]}>{option.label}</Text>
      {option.count !== undefined && <Text style={[styles.count, { color: t.muted }]}>{option.count}</Text>}
    </Pressable>;
  });
  const track = [plain ? styles.tabs : [styles.segmented, { borderColor: t.line }]];
  if (scroll) return <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[{ flexGrow: 0 }, style]} contentContainerStyle={track}>{items}</ScrollView>;
  return <View style={[track, style]}>{items}</View>;
}

/** `.tag`: tiny label; `accent` = soft accent fill, otherwise `.tag.muted`. With `onPress` it reads as a link. */
export function Chip({ label, accent, onPress }: { label: string; accent?: boolean; onPress?: () => void }) {
  const t = useTheme();
  return <Pressable disabled={!onPress} onPress={onPress} style={[styles.chip, { backgroundColor: accent ? t.soft : t.surface2 }]}>
    <Text style={[styles.chipText, { color: accent || onPress ? t.accent : t.muted }]}>{label}</Text>
  </Pressable>;
}
/** `.mark`: small mono badge (stage, STM, count) on surface2. */
export function Mark({ children, style, textStyle }: { children: ReactNode; style?: StyleProp<ViewStyle>; textStyle?: StyleProp<TextStyle> }) {
  const t = useTheme();
  return <View style={[styles.mark, { backgroundColor: t.surface2 }, style]}><Text style={[styles.markText, { color: t.secondary }, textStyle]}>{children}</Text></View>;
}

/** Web `input`: transparent, 1px line border, radius 8; the border strengthens on focus. `small` = 32 px. */
export function Input({ style, small, ...props }: TextInputProps & { small?: boolean }) {
  const t = useTheme();
  const [focused, setFocused] = useState(false);
  return <TextInput {...props} placeholderTextColor={t.muted} selectionColor={t.soft} cursorColor={t.accent} onFocus={e => { setFocused(true); props.onFocus?.(e); }} onBlur={e => { setFocused(false); props.onBlur?.(e); }}
    style={[styles.input, small && styles.inputSmall, { color: t.text, borderColor: focused ? t.lineStrong : t.line }, props.multiline && { textAlignVertical: "top" }, style]} />;
}

/** `.label`: quiet 11 px uppercase caption (0.06em, muted) above a value or a block. */
export function Label({ children, style, size = 11, numberOfLines }: { children: ReactNode; style?: StyleProp<TextStyle>; size?: number; numberOfLines?: number }) {
  const t = useTheme();
  return <Text numberOfLines={numberOfLines} style={[styles.label, { color: t.muted, fontSize: size, letterSpacing: size * (size <= 10 ? 0.04 : 0.06) }, style]}>{children}</Text>;
}
/** Older name of `Label` (`.card h2`, `.practice-caption`). */
export function Caption({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Label style={style}>{children}</Label>;
}

/** One figure: `.label` over a mono value; `tone` colours the value (good = best, bad = worst, accent = averages). */
export const Metric = memo(function Metric({ label, value, tone, valueSize = 15, labelSize = 10, style }: { label: string; value: string; tone?: Tone; valueSize?: number; labelSize?: number; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return <View style={[styles.metric, style]}>
    <Label size={labelSize} numberOfLines={1}>{label}</Label>
    <Text numberOfLines={1} style={[styles.metricValue, { color: toneColor(t, tone), fontSize: valueSize, lineHeight: Math.round(valueSize * 1.2) }]}>{value}</Text>
  </View>;
});
export interface MetricItem { label: string; value: string; tone?: Tone }
/**
 * `.metrics`: a grid of figures with 1px dividers, a top border and `columns` per row (default: all on one
 * row). `dense` is `.metrics-full` (timer: 4×2, 8/10/10 padding); otherwise `.is-mobile .metric` (10/10/12).
 */
export function Metrics({ items, columns, dense, border = true, valueSize, style }: { items: MetricItem[]; columns?: number; dense?: boolean; border?: boolean; valueSize?: number; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  const perRow = Math.max(1, columns ?? items.length);
  const rows: MetricItem[][] = [];
  for (let i = 0; i < items.length; i += perRow) rows.push(items.slice(i, i + perRow));
  return <View style={[border && { borderTopWidth: 1, borderColor: t.line }, style]}>
    {rows.map((row, r) => <View key={r} style={[styles.metricsRow, r > 0 && { borderTopWidth: 1, borderColor: t.line }]}>
      {Array.from({ length: perRow }, (_, c) => {
        const item = row[c];
        const cell = [styles.metricCell, dense ? styles.metricDense : styles.metricLoose, c > 0 && item && { borderLeftWidth: 1, borderColor: t.line }];
        return item ? <Metric key={c} label={item.label} value={item.value} tone={item.tone} valueSize={valueSize} style={cell} /> : <View key={c} style={styles.metricCell} />;
      })}
    </View>)}
  </View>;
}
/** Older figure: `.label` caption over a 22 px mono value (`center` to centre it in a flex row). */
export const Kpi = memo(function Kpi({ label, value, center, valueSize, tone }: { label: string; value: string; center?: boolean; valueSize?: number; tone?: Tone }) {
  const t = useTheme();
  return <View style={[styles.kpi, center && { alignItems: "center", flex: 1 }]}>
    <Label numberOfLines={1}>{label}</Label>
    <Text style={[styles.metricValue, { color: toneColor(t, tone), fontSize: valueSize ?? 22, lineHeight: Math.round((valueSize ?? 22) * 1.2) }]} numberOfLines={1}>{value}</Text>
  </View>;
});

/**
 * `.is-mobile .page-head`: title (20 px) with a muted `sub` on one line, an optional back button (`onBack`)
 * or `lead` element before it and a `right` element after it (the puzzle control), then `controls` in a
 * row that scrolls sideways edge to edge. Bottom 1px line. `padding` defaults to the phone's 14 px.
 */
export function PageHead({ title, sub, onBack, lead, right, controls, padding = 14, style }: {
  title: string; sub?: string; onBack?: () => void; lead?: ReactNode; right?: ReactNode; controls?: ReactNode; padding?: number; style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  return <View style={[styles.pageHead, { paddingHorizontal: padding, borderColor: t.line }, style]}>
    <View style={styles.pageTitle}>
      {onBack && <Btn iconOnly icon={IconBack} onPress={onBack} accessibilityLabel="Back" />}
      {lead}
      <View style={styles.pageTitleText}>
        <Text numberOfLines={1} style={[styles.pageH1, { color: t.text }]}>{title}</Text>
        {sub ? <Text numberOfLines={1} style={[styles.pageSub, { color: t.muted }]}>{sub}</Text> : null}
      </View>
      {right}
    </View>
    {controls && <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ marginHorizontal: -padding, flexGrow: 0 }} contentContainerStyle={[styles.controls, { paddingHorizontal: padding }]}>{controls}</ScrollView>}
  </View>;
}

/** `.checkbox`: 16 px square, 1.5 px border; checked = text fill with a check (`tone="good"`: learned green). */
export function Checkbox({ checked, mixed, onPress, tone, disabled, size = 16, accessibilityLabel, style }: { checked: boolean; mixed?: boolean; onPress?: () => void; tone?: "good" | "accent"; disabled?: boolean; size?: number; accessibilityLabel?: string; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  const on = checked || mixed;
  const fill = tone === "good" ? t.good : tone === "accent" ? t.accent : t.text;
  const box = <View style={[styles.checkbox, { width: size, height: size, borderColor: on ? fill : t.checkboxLine, backgroundColor: on ? fill : "transparent" }, !onPress && style]}>
    {checked ? <IconCheck size={size - 5} color={t.bg} /> : mixed ? <IconMinus size={size - 5} color={t.bg} /> : null}
  </View>;
  if (!onPress) return box;
  return <Pressable onPress={onPress} disabled={disabled} hitSlop={10} accessibilityRole="checkbox" accessibilityLabel={accessibilityLabel} accessibilityState={{ checked: mixed && !checked ? "mixed" : checked, disabled }}
    style={[styles.checkHit, { opacity: disabled ? 0.35 : 1 }, style]}>{box}</Pressable>;
}

/**
 * A flat list row (`.case-row`, `.setup-set-head`): `left` (diagram, checkbox), `title` + `sub`, `right`
 * (time, actions) and an optional chevron. Pressed = hover fill, `selected` = surface2; `divider` draws a
 * bottom 1px line instead of rounding the row. `height` defaults to 50.
 */
export function ListRow({ title, sub, left, right, chevron, selected, divider, height = 50, onPress, onLongPress, disabled, children, style, titleStyle, accessibilityLabel }: {
  title?: ReactNode; sub?: ReactNode; left?: ReactNode; right?: ReactNode; chevron?: boolean; selected?: boolean; divider?: boolean; height?: number;
  onPress?: () => void; onLongPress?: () => void; disabled?: boolean; children?: ReactNode; style?: StyleProp<ViewStyle>; titleStyle?: StyleProp<TextStyle>; accessibilityLabel?: string;
}) {
  const t = useTheme();
  return <Pressable onPress={onPress} onLongPress={onLongPress} disabled={disabled || (!onPress && !onLongPress)} accessibilityRole={onPress ? "button" : undefined} accessibilityLabel={accessibilityLabel} accessibilityState={selected ? { selected } : undefined}
    style={({ pressed }) => [styles.row, { minHeight: height, backgroundColor: selected ? t.surface2 : pressed ? t.hover : "transparent" }, divider && { borderRadius: 0, borderBottomWidth: 1, borderColor: t.line }, style]}>
    {left}
    {(title !== undefined || sub !== undefined) && <View style={styles.rowText}>
      {typeof title === "string" ? <Text numberOfLines={1} style={[styles.rowTitle, { color: t.text }, titleStyle]}>{title}</Text> : title}
      {typeof sub === "string" ? <Text numberOfLines={1} style={[styles.rowSub, { color: t.muted }]}>{sub}</Text> : sub}
    </View>}
    {children}
    {right}
    {chevron && <IconNext size={14} color={t.muted} />}
  </Pressable>;
}

/** Raised card (`.ov-card`, inline dialog body): `raised` fill, 1px line, radius 12, 16 px padding unless `flush`. */
export function Panel({ children, flush, style }: { children: ReactNode; flush?: boolean; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return <View style={[styles.panel, { backgroundColor: t.raised, borderColor: t.line }, !flush && { padding: 16 }, style]}>{children}</View>;
}

// All skeleton lines share one pulse, like the CSS animation (opacity 1 → .5 → 1 over 1.4 s).
const pulse = new Animated.Value(1);
let pulsing = 0, pulseLoop: Animated.CompositeAnimation | null = null;
function usePulse() {
  useEffect(() => {
    if (pulsing++ === 0) {
      pulseLoop = Animated.loop(Animated.sequence([
        Animated.timing(pulse, { toValue: 0.5, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]));
      pulseLoop.start();
    }
    return () => { if (--pulsing === 0) { pulseLoop?.stop(); pulse.setValue(1); } };
  }, []);
  return pulse;
}
/** `.skeleton-line`: pulsing surface2 bar (radius 6) standing in for text or a block; never use a spinner. */
export function SkeletonLine({ width = "100%", height = 12, radius = 6, style }: { width?: number | `${number}%`; height?: number; radius?: number; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  const opacity = usePulse();
  return <Animated.View style={[{ width, height, borderRadius: radius, backgroundColor: t.surface2, opacity }, style]} />;
}

/** `.progress`: 4 px bar; muted fill, accent when `unlocked`. `value` from 0 to 1. */
export function ProgressBar({ value, unlocked, style }: { value: number; unlocked?: boolean; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return <View style={[styles.progress, { backgroundColor: t.surface2 }, style]}>
    <View style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%`, height: "100%", borderRadius: 2, backgroundColor: unlocked ? t.accent : t.muted }} />
  </View>;
}

/** Muted body text (`.muted`, 14 px). */
export function Muted({ children, style, size = 14, numberOfLines }: { children: ReactNode; style?: StyleProp<TextStyle>; size?: number; numberOfLines?: number }) {
  const t = useTheme();
  return <Text numberOfLines={numberOfLines} style={[{ color: t.muted, fontSize: size, lineHeight: size * 1.45 }, style]}>{children}</Text>;
}
/** Body text (14 px, 400, line-height 1.45). */
export function Body({ children, style, size = 14, weight = "400", color, numberOfLines, selectable }: { children: ReactNode; style?: StyleProp<TextStyle>; size?: number; weight?: TextStyle["fontWeight"]; color?: string; numberOfLines?: number; selectable?: boolean }) {
  const t = useTheme();
  return <Text selectable={selectable} numberOfLines={numberOfLines} style={[{ color: color ?? t.text, fontSize: size, fontWeight: weight, lineHeight: size * 1.45 }, style]}>{children}</Text>;
}
/** `h1` (22 px, 600, -0.02em); `size` for other headings (`h2` 18, `h3` 15). */
export function H1({ children, size = 22, style }: { children: ReactNode; size?: number; style?: StyleProp<TextStyle> }) {
  const t = useTheme();
  return <Text style={[{ color: t.text, fontSize: size, fontWeight: "600", letterSpacing: -size * (size >= 20 ? 0.02 : 0.015), lineHeight: size * 1.2 }, style]}>{children}</Text>;
}
/** Error line under a form. */
export function FormError({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return <View style={[{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 }, style]}><Text style={{ color: t.danger, fontSize: 13, flexShrink: 1 }}>{children}</Text></View>;
}
/** `.empty`: centred muted message with 28 px padding. */
export function Empty({ children, icon, style }: { children: ReactNode; icon?: ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return <View style={[styles.empty, style]}>{icon}{typeof children === "string" ? <Text style={{ color: t.muted, fontSize: 14, textAlign: "center" }}>{children}</Text> : children}</View>;
}
/** 1px `t.line` separator (`vertical` for a column divider). */
export function Divider({ vertical, style }: { vertical?: boolean; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return <View style={[vertical ? { width: 1, alignSelf: "stretch" } : { height: 1 }, { backgroundColor: t.line }, style]} />;
}
/** `.avatar`: initials on surface3 (`active`: accent). */
export function Avatar({ username, large, small, active, size: explicit }: { username: string; large?: boolean; small?: boolean; active?: boolean; size?: number }) {
  const t = useTheme();
  const size = explicit ?? (large ? 60 : small ? 20 : 36);
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: active ? t.accent : t.surface3, alignItems: "center", justifyContent: "center" }}>
    <Text style={{ color: active ? "#fff" : t.text, fontSize: Math.max(8, Math.round(size * 0.36)), fontWeight: "600" }}>{username.trim().slice(0, size < 24 ? 1 : 2).toUpperCase()}</Text>
  </View>;
}
/** Geist Mono text style with tabular figures (`.mono`), for times, counts and move notation. */
export const mono = (t: Theme, size: number, weight: TextStyle["fontWeight"] = "500"): TextStyle => ({ fontFamily: FONT.mono, fontSize: size, fontWeight: weight, color: t.text, fontVariant: ["tabular-nums"] });

export const styles = StyleSheet.create({
  btn: { flexDirection: "row", alignItems: "center", justifyContent: "center", flexShrink: 0, gap: 7, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: "transparent" },
  control: { gap: 6, paddingHorizontal: 11 },
  btnText: { fontSize: 13, fontWeight: "500" },
  controls: { flexDirection: "row", alignItems: "center", gap: 6 },
  miniBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, height: 24, minHeight: 24, paddingHorizontal: 6, borderRadius: 6 },
  miniIcon: { width: 24, paddingHorizontal: 0 },
  miniText: { fontSize: 11, fontWeight: "600" },
  segmented: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 2, padding: 2, borderWidth: 1, borderRadius: 9 },
  segment: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 26, paddingHorizontal: 9, borderRadius: 6 },
  segmentText: { fontSize: 12.5, fontWeight: "500" },
  tabs: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 2 },
  tab: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, height: 32, paddingHorizontal: 12, borderRadius: 8 },
  tabText: { fontSize: 13, fontWeight: "500" },
  count: { fontSize: 11, fontFamily: FONT.mono },
  chip: { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 5, alignSelf: "flex-start" },
  chipText: { fontSize: 10, fontWeight: "700" },
  mark: { paddingHorizontal: 5, borderRadius: 4, alignSelf: "flex-start" },
  markText: { fontFamily: FONT.mono, fontSize: 10.5, fontWeight: "600", lineHeight: 16 },
  input: { minHeight: 36, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 8, borderWidth: 1, fontSize: 14, backgroundColor: "transparent" },
  inputSmall: { minHeight: 32, paddingVertical: 5, fontSize: 13 },
  label: { fontWeight: "500", textTransform: "uppercase" },
  metric: { minWidth: 0, gap: 3 },
  metricsRow: { flexDirection: "row" },
  metricCell: { flex: 1, minWidth: 0 },
  metricDense: { paddingTop: 8, paddingHorizontal: 10, paddingBottom: 10 },
  metricLoose: { paddingTop: 10, paddingHorizontal: 10, paddingBottom: 12 },
  metricValue: { fontFamily: FONT.mono, fontWeight: "500", letterSpacing: -0.15, fontVariant: ["tabular-nums"] },
  kpi: { minWidth: 0, gap: 4 },
  pageHead: { gap: 8, paddingVertical: 10, borderBottomWidth: 1, flexShrink: 0 },
  pageTitle: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 32 },
  pageTitleText: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "baseline", gap: 12 },
  pageH1: { fontSize: 20, fontWeight: "600", letterSpacing: -0.4, flexShrink: 0 },
  pageSub: { fontSize: 13, flexShrink: 1 },
  checkbox: { borderWidth: 1.5, borderRadius: 4, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  checkHit: { alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingLeft: 8, paddingRight: 8, borderRadius: 8 },
  rowText: { flex: 1, minWidth: 0, gap: 1 },
  rowTitle: { fontSize: 13.5, fontWeight: "600" },
  rowSub: { fontSize: 12 },
  panel: { borderRadius: 12, borderWidth: 1 },
  progress: { height: 4, borderRadius: 2, overflow: "hidden" },
  empty: { alignItems: "center", justifyContent: "center", gap: 10, padding: 28 },
});
