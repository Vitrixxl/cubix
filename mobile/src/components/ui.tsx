import { Children, Fragment, createContext, isValidElement, memo, useContext, useEffect, useState, type ReactNode } from "react";
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions, type PressableProps, type StyleProp, type TextInputProps, type TextStyle, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FONT, useTheme, type Theme } from "../theme";
import { IconBack, IconCheck, IconMinus, type Icon } from "./icons";

/**
 * Shared primitives mirroring the web stylesheet (desktop/renderer/styles.css, `.is-mobile` rules):
 * `.button`, `.control`, `.segmented`, `.label`, `.metric(s)`, `.page-head`, `.mark`, `.tag`, `.checkbox`,
 * `.progress`, `.skeleton-line`, inputs and flat rows. Flat, 1px `t.line` borders, 8–12 px radii, Geist.
 * Every `<Text>` is Geist already (src/fonts.ts); use `fontFamily: FONT.mono` (or `mono()`) for figures and moves.
 */

/** Text colour of a tone, as `.metric.tone-*` / `.good` / `.danger` / `.accent`. */
export type Tone = "good" | "bad" | "danger" | "accent" | "muted";
function toneColor(t: Theme, tone: Tone | undefined, fallback = t.text): string {
  return tone === "good" ? t.good : tone === "bad" || tone === "danger" ? t.danger : tone === "accent" ? t.accent : tone === "muted" ? t.muted : fallback;
}

/** An icon given as a component (`IconUndo`) is drawn at `size` in `color`; an element is used as is. */
function renderIcon(icon: Icon | ReactNode, size: number, color: string): ReactNode {
  if (typeof icon === "function") { const I = icon as Icon; return <I size={size} color={color} />; }
  return icon as ReactNode;
}

export type ButtonVariant = "control" | "primary" | "ghost" | "soft";
export type ButtonProps = Omit<PressableProps, "style" | "children"> & {
  children?: ReactNode;
  /** An icon component (`IconUndo`, drawn 15 px, muted then text when active) or any element. */
  icon?: Icon | ReactNode;
  label?: string;
  /**
   * `control` (default): `.control`, 32 px, 1px line border, text colour.
   * `primary`: `.button.primary`, accent fill, white semibold label.
   * `ghost`: plain `.button`, transparent, secondary text, hover fill while pressed.
   * `soft`: `.soft`, surface3 fill.
   */
  variant?: ButtonVariant;
  /** Selected state (`.active`): surface3 fill, no border. */
  active?: boolean;
  /** 28 px high (`.column-head .control`). `size` sets any other height (30 for solve actions and settings). */
  small?: boolean; size?: number;
  /** Square button holding only its icon. */
  iconOnly?: boolean;
  /** Colours label and icon: `good` (`.is-learned`), `danger`, `accent`. */
  tone?: Tone;
  /** Label in Geist Mono (`.solve-actions .control`: +2, DNF). */
  mono?: boolean;
  style?: StyleProp<ViewStyle>; textStyle?: StyleProp<TextStyle>;
};
/**
 * `.page-head .control`: inside a page header, controls are cells of its grid, as tall as their row, square,
 * split by 1px lines; `grow` makes the cells of the controls row share its width.
 */
export interface HeadCell { height: number; grow: boolean; /** An equal share of the row, so the lines of both rows meet. */ width?: number }
const HeadCellContext = createContext<HeadCell | null>(null);
/** The header row a control sits in, null outside a page header. */
export const useHeadCell = () => useContext(HeadCellContext);
/** Makes the controls inside it cells of a header row `height` tall (page headers, dialog headers). */
export function HeadCells({ height, grow = false, children }: { height: number; grow?: boolean; children: ReactNode }) {
  return <HeadCellContext.Provider value={{ height, grow }}>{children}</HeadCellContext.Provider>;
}
/** The frame of a header cell: its row's height, no radius, a line on its left. */
export const headCellStyle = (t: Theme, cell: HeadCell): ViewStyle => ({
  height: cell.height, minHeight: cell.height, flexGrow: cell.grow && cell.width === undefined ? 1 : 0, justifyContent: "center", paddingHorizontal: cell.width === undefined ? 12 : 6, gap: 6,
  borderRadius: 0, borderWidth: 0, borderLeftWidth: 1, borderColor: t.line, ...(cell.width !== undefined && { width: cell.width }),
});

/**
 * `.segmented`, `.solve-actions`…: a group of cells sharing their lines, wrapping or not. Buttons inside it overlap
 * their right and bottom neighbours by 1px, so two cells never draw a double line.
 */
const CellGroupContext = createContext(false);
export function CellGroup({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <CellGroupContext.Provider value><View style={[styles.cellGroup, style, { gap: 0 }]}>{children}</View></CellGroupContext.Provider>;
}
const inGroup: ViewStyle = { marginRight: -1, marginBottom: -1 };

/**
 * `.button` / `.control` / `.button.primary`: the app's only button, a cell of the grid: square corners and a 1px
 * line all around (accent on primary); the active one on surface2 in the accent colour.
 */
export function Btn({ children, icon, label, variant: kind = "control", active: selected = false, small, size, iconOnly, tone, mono: monoLabel, style, textStyle, disabled, ...rest }: ButtonProps) {
  const t = useTheme();
  const cell = useHeadCell();
  const grouped = useContext(CellGroupContext);
  const [down, setDown] = useState(false);
  const height = cell?.height ?? size ?? (small ? 28 : 32);
  let background = "transparent", border = t.line, color = t.text, iconColor = t.muted;
  if (kind === "primary") { background = down ? t.accentPressed : t.accent; border = t.accent; color = "#fff"; iconColor = "#fff"; }
  else if (selected) { background = t.surface2; color = t.accent; iconColor = t.accent; }
  else if (kind === "soft") { background = down ? t.surface3Hover : t.surface3; iconColor = t.text; }
  else if (kind === "ghost") { background = down ? t.hover : "transparent"; color = down ? t.text : t.secondary; iconColor = down ? t.text : t.muted; }
  else { background = down ? t.hover : "transparent"; if (down) iconColor = t.text; }
  if (tone && kind !== "primary") { color = toneColor(t, tone); iconColor = color; }
  return <Pressable {...rest} disabled={disabled} accessibilityRole={rest.accessibilityRole ?? "button"} accessibilityState={rest.accessibilityState ?? (selected ? { selected: true } : undefined)}
    onPressIn={e => { setDown(true); rest.onPressIn?.(e); }} onPressOut={e => { setDown(false); rest.onPressOut?.(e); }}
    style={[styles.btn, kind === "control" && styles.control, { height, minHeight: height, backgroundColor: background, borderColor: border, opacity: disabled ? 0.35 : 1 }, cell && headCellStyle(t, cell), grouped && !cell && inGroup, iconOnly && { width: height, paddingHorizontal: 0 }, cell?.width !== undefined && { width: cell.width }, style]}>
    {icon !== undefined && renderIcon(icon, small ? 14 : 15, iconColor)}
    {label !== undefined && <Text numberOfLines={1} style={[styles.btnText, kind === "primary" && { fontWeight: "600" }, monoLabel && { fontFamily: FONT.mono, fontSize: 12.5 }, small && { fontSize: 12 }, { color }, textStyle]}>{label}</Text>}
    {children}
  </Pressable>;
}
/** `.control`: a bordered header/pane control (menus, toggles, small actions). Same props as `Btn`. */
export const Control = (props: Omit<ButtonProps, "variant">) => <Btn {...props} variant="control" />;
/** `.button.times-action`: 24 px compact action of a times row (+2, DNF, delete, info); `on` = active. */
export function MiniBtn({ icon, label, on, danger, disabled, ...rest }: Omit<PressableProps, "style" | "children"> & { icon?: Icon | ReactNode; label?: string; on?: boolean; danger?: boolean }) {
  const t = useTheme();
  const [down, setDown] = useState(false);
  const grouped = useContext(CellGroupContext);
  const color = on ? t.accent : danger && down ? t.danger : down ? t.text : t.muted;
  return <Pressable {...rest} disabled={disabled} hitSlop={6} onPressIn={e => { setDown(true); rest.onPressIn?.(e); }} onPressOut={e => { setDown(false); rest.onPressOut?.(e); }}
    style={[styles.miniBtn, !label && styles.miniIcon, { borderColor: t.line, backgroundColor: on ? t.surface2 : down ? t.hover : "transparent", opacity: disabled ? 0.35 : 1 }, grouped && inGroup]}>
    {icon !== undefined && renderIcon(icon, 13, color)}
    {label !== undefined && <Text style={[styles.miniText, { color }]}>{label}</Text>}
  </Pressable>;
}

/** In a page header's row of equal shares, a group of cells takes two. */
const SEGMENTED_SHARES = 2;
export interface SegmentOption<T extends string> { id: T; label: string; count?: number; icon?: Icon | ReactNode }
/**
 * `.segmented`: bordered track (radius 9, 2 px inset) of 26 px items; the active one is surface3.
 * `plain` drops the track for a row of 32 px `.button`s (stage tabs); `scroll` lets a long row scroll sideways.
 */
export function Segmented<T extends string>({ options, value, onChange, disabled, plain, scroll, style, itemStyle, textStyle }: {
  options: SegmentOption<T>[]; value: T; onChange: (value: T) => void; disabled?: boolean;
  plain?: boolean; scroll?: boolean; style?: StyleProp<ViewStyle>; itemStyle?: StyleProp<ViewStyle>; textStyle?: StyleProp<TextStyle>;
}) {
  const t = useTheme();
  const cell = useHeadCell();
  const items = options.map(option => {
    const active = option.id === value;
    const color = active ? t.accent : t.secondary;
    const fill = active ? t.surface2 : "transparent";
    return <Pressable key={option.id} disabled={disabled} accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={() => onChange(option.id)}
      style={({ pressed }) => [plain ? styles.tab : styles.segment, { borderColor: t.line }, cell ? headCellStyle(t, { ...cell, width: cell.width === undefined ? undefined : cell.width * SEGMENTED_SHARES / options.length }) : inGroup, { backgroundColor: pressed && !active ? t.hover : fill, opacity: disabled ? 0.35 : 1 }, itemStyle]}>
      {option.icon !== undefined && renderIcon(option.icon, 14, active ? t.text : t.muted)}
      <Text numberOfLines={1} style={[plain ? styles.tabText : styles.segmentText, { color }, textStyle]}>{option.label}</Text>
      {option.count !== undefined && <Text style={[styles.count, { color: t.muted }]}>{option.count}</Text>}
    </Pressable>;
  });
  const track = cell ? { flexDirection: "row" as const, flexGrow: cell.grow ? 1 : 0 } : plain ? styles.tabs : styles.segmented;
  if (scroll) return <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[{ flexGrow: 0 }, style]} contentContainerStyle={track}>{items}</ScrollView>;
  return <View style={[track, style]}>{items}</View>;
}

/** `.mark`: small mono badge (stage, STM, count) on surface2. */
export function Mark({ children, textStyle }: { children: ReactNode; textStyle?: StyleProp<TextStyle> }) {
  const t = useTheme();
  return <View style={[styles.mark, { backgroundColor: t.surface2 }]}><Text style={[styles.markText, { color: t.secondary }, textStyle]}>{children}</Text></View>;
}

/** Web `input`: transparent, 1px line border, radius 8; the border strengthens on focus. */
export function Input({ style, ...props }: TextInputProps) {
  const t = useTheme();
  const [focused, setFocused] = useState(false);
  return <TextInput {...props} placeholderTextColor={t.muted} selectionColor={t.soft} cursorColor={t.accent} onFocus={e => { setFocused(true); props.onFocus?.(e); }} onBlur={e => { setFocused(false); props.onBlur?.(e); }}
    style={[styles.input, { color: t.text, borderColor: focused ? t.lineStrong : t.line }, props.multiline && { textAlignVertical: "top" }, style]} />;
}

/** `.label`: quiet 11 px uppercase caption (0.06em, muted) above a value or a block. */
export function Label({ children, style, size = 11, numberOfLines }: { children: ReactNode; style?: StyleProp<TextStyle>; size?: number; numberOfLines?: number }) {
  const t = useTheme();
  return <Text numberOfLines={numberOfLines} style={[styles.label, { color: t.muted, fontSize: size, letterSpacing: size * (size <= 10 ? 0.04 : 0.06) }, style]}>{children}</Text>;
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
export function Metrics({ items, columns, dense, valueSize }: { items: MetricItem[]; columns?: number; dense?: boolean; valueSize?: number }) {
  const t = useTheme();
  const perRow = Math.max(1, columns ?? items.length);
  const rows: MetricItem[][] = [];
  for (let i = 0; i < items.length; i += perRow) rows.push(items.slice(i, i + perRow));
  return <View style={{ borderTopWidth: 1, borderColor: t.line }}>
    {rows.map((row, r) => <View key={r} style={[styles.metricsRow, r > 0 && { borderTopWidth: 1, borderColor: t.line }]}>
      {Array.from({ length: perRow }, (_, c) => {
        const item = row[c];
        const cell = [styles.metricCell, dense ? styles.metricDense : styles.metricLoose, c > 0 && item && { borderLeftWidth: 1, borderColor: t.line }];
        return item ? <Metric key={c} label={item.label} value={item.value} tone={item.tone} valueSize={valueSize} style={cell} /> : <View key={c} style={styles.metricCell} />;
      })}
    </View>)}
  </View>;
}
/**
 * `.is-mobile .page-head`: title (20 px) with a muted `sub` on one line, an optional back button (`onBack`)
 * or `lead` element before it and a `right` element after it (the puzzle control), then `controls` in a
 * row that scrolls sideways edge to edge. Bottom 1px line. `padding` defaults to the phone's 14 px.
 */
export function PageHead({ title, sub, onBack, lead, right, controls, padding = 14 }: {
  title: string; sub?: string; onBack?: () => void; lead?: ReactNode; right?: ReactNode; controls?: ReactNode; padding?: number;
}) {
  const t = useTheme();
  const window = useWindowDimensions(), insets = useSafeAreaInsets();
  // As on the web: a 52 px title row whose back arrow and `right` control are its first and last cells, then a
  // 44 px row of control cells sharing it equally, the `right` cell as wide as one share so the lines of both rows
  // meet. The row is shifted 1px left so its first cell's line falls off the screen.
  const flat = (nodes: ReactNode): ReactNode[] => Children.toArray(nodes).flatMap(n => isValidElement(n) && n.type === Fragment ? flat((n.props as { children?: ReactNode }).children) : [n]);
  const shares = flat(controls).reduce<number>((sum, n) => sum + (isValidElement(n) && n.type === Segmented ? SEGMENTED_SHARES : 1), 0);
  // Phones only, like the web; larger screens keep cells as wide as their words.
  const share = shares && window.width <= 700 ? (window.width - insets.left - insets.right + 1) / shares : undefined;
  const titleCell = { height: 52, grow: false };
  return <View style={[styles.pageHead, { borderColor: t.line }]}>
    <View style={[styles.pageTitle, { paddingLeft: padding, paddingRight: right ? 0 : padding }]}>
      <HeadCellContext.Provider value={titleCell}>
        {onBack && <Btn iconOnly icon={IconBack} onPress={onBack} accessibilityLabel="Back" style={{ marginLeft: -padding, borderLeftWidth: 0, borderRightWidth: 1 }} />}
      </HeadCellContext.Provider>
      {lead}
      <View style={styles.pageTitleText}>
        <Text numberOfLines={1} style={[styles.pageH1, { color: t.text }]}>{title}</Text>
        {sub ? <Text numberOfLines={1} style={[styles.pageSub, { color: t.muted }]}>{sub}</Text> : null}
      </View>
      <HeadCellContext.Provider value={{ ...titleCell, width: share }}>{right}</HeadCellContext.Provider>
    </View>
    {controls && <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={[styles.controlsRow, { borderColor: t.line }]} contentContainerStyle={styles.controls}>
      <HeadCellContext.Provider value={{ height: 44, grow: true, width: share }}>{controls}</HeadCellContext.Provider>
    </ScrollView>}
  </View>;
}

/** `.checkbox`: 16 px square, 1.5 px border; checked = text fill with a check (`tone="good"`: learned green). */
export function Checkbox({ checked, mixed, onPress, tone, accessibilityLabel, style }: { checked: boolean; mixed?: boolean; onPress?: () => void; tone?: "good" | "accent"; accessibilityLabel?: string; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  const size = 16;
  const on = checked || mixed;
  const fill = tone === "good" ? t.good : tone === "accent" ? t.accent : t.text;
  const box = <View style={[styles.checkbox, { width: size, height: size, borderColor: on ? fill : t.checkboxLine, backgroundColor: on ? fill : "transparent" }, !onPress && style]}>
    {checked ? <IconCheck size={size - 5} color={t.bg} /> : mixed ? <IconMinus size={size - 5} color={t.bg} /> : null}
  </View>;
  if (!onPress) return box;
  return <Pressable onPress={onPress} hitSlop={10} accessibilityRole="checkbox" accessibilityLabel={accessibilityLabel} accessibilityState={{ checked: mixed && !checked ? "mixed" : checked }}
    style={[styles.checkHit, style]}>{box}</Pressable>;
}

/** A flat list row (`.case-row`): `left` (diagram), then `title` over a muted `sub`. Pressed = hover fill. */
export function ListRow({ title, sub, left, height, onPress }: { title: string; sub: string; left: ReactNode; height: number; onPress: () => void }) {
  const t = useTheme();
  return <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [styles.row, { minHeight: height, backgroundColor: pressed ? t.hover : "transparent" }]}>
    {left}
    <View style={styles.rowText}>
      <Text numberOfLines={1} style={[styles.rowTitle, { color: t.text }]}>{title}</Text>
      <Text numberOfLines={1} style={[styles.rowSub, { color: t.muted }]}>{sub}</Text>
    </View>
  </Pressable>;
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
    <View style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%`, height: "100%", borderRadius: 0, backgroundColor: unlocked ? t.accent : t.muted }} />
  </View>;
}

/** Muted body text (`.muted`, 14 px). */
export function Muted({ children, style, size = 14 }: { children: ReactNode; style?: StyleProp<TextStyle>; size?: number }) {
  const t = useTheme();
  return <Text style={[{ color: t.muted, fontSize: size, lineHeight: size * 1.45 }, style]}>{children}</Text>;
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
export function Empty({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return <View style={[styles.empty, style]}>{typeof children === "string" ? <Text style={{ color: t.muted, fontSize: 14, textAlign: "center" }}>{children}</Text> : children}</View>;
}
/** `.avatar`: initials on surface3 (`active`: accent). */
export function Avatar({ username, active, size }: { username: string; active?: boolean; size: number }) {
  const t = useTheme();
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: active ? t.accent : t.surface3, alignItems: "center", justifyContent: "center" }}>
    <Text style={{ color: active ? "#fff" : t.text, fontSize: Math.max(8, Math.round(size * 0.36)), fontWeight: "600" }}>{username.trim().slice(0, size < 24 ? 1 : 2).toUpperCase()}</Text>
  </View>;
}
/** Geist Mono text style with tabular figures (`.mono`), for times, counts and move notation. */
export const mono = (t: Theme, size: number, weight: TextStyle["fontWeight"] = "500"): TextStyle => ({ fontFamily: FONT.mono, fontSize: size, fontWeight: weight, color: t.text, fontVariant: ["tabular-nums"] });

export const styles = StyleSheet.create({
  btn: { flexDirection: "row", alignItems: "center", justifyContent: "center", flexShrink: 0, gap: 7, paddingHorizontal: 12, borderRadius: 0, borderWidth: 1, borderColor: "transparent" },
  control: { gap: 6, paddingHorizontal: 11 },
  btnText: { fontSize: 13, fontWeight: "500" },
  controls: { flexGrow: 1, flexDirection: "row" },
  controlsRow: { flexGrow: 0, marginLeft: -1, borderTopWidth: 1 },
  miniBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, height: 24, minHeight: 24, paddingHorizontal: 6, borderRadius: 0, borderWidth: 1 },
  miniIcon: { width: 24, paddingHorizontal: 0 },
  miniText: { fontSize: 11, fontWeight: "600" },
  segmented: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", paddingRight: 1, paddingBottom: 1 },
  segment: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 32, paddingHorizontal: 12, borderRadius: 0, borderWidth: 1 },
  cellGroup: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", paddingRight: 1, paddingBottom: 1 },
  segmentText: { fontSize: 12.5, fontWeight: "500" },
  tabs: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", paddingRight: 1, paddingBottom: 1 },
  tab: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, height: 32, paddingHorizontal: 14, borderRadius: 0, borderWidth: 1 },
  tabText: { fontSize: 13, fontWeight: "500" },
  count: { fontSize: 11, fontFamily: FONT.mono },
  mark: { paddingHorizontal: 5, borderRadius: 0, alignSelf: "flex-start" },
  markText: { fontFamily: FONT.mono, fontSize: 10.5, fontWeight: "600", lineHeight: 16 },
  input: { minHeight: 36, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 0, borderWidth: 1, fontSize: 14, backgroundColor: "transparent" },
  label: { fontWeight: "500", textTransform: "uppercase" },
  metric: { minWidth: 0, gap: 3 },
  metricsRow: { flexDirection: "row" },
  metricCell: { flex: 1, minWidth: 0 },
  metricDense: { paddingTop: 8, paddingHorizontal: 10, paddingBottom: 10 },
  metricLoose: { paddingTop: 10, paddingHorizontal: 10, paddingBottom: 12 },
  metricValue: { fontFamily: FONT.mono, fontWeight: "500", letterSpacing: -0.15, fontVariant: ["tabular-nums"] },
  pageHead: { borderBottomWidth: 1, flexShrink: 0 },
  pageTitle: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 52 },
  pageTitleText: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "baseline", gap: 12 },
  pageH1: { fontSize: 20, fontWeight: "600", letterSpacing: -0.4, flexShrink: 0 },
  pageSub: { fontSize: 13, flexShrink: 1 },
  checkbox: { borderWidth: 1.5, borderRadius: 0, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  checkHit: { alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingLeft: 8, paddingRight: 8, borderRadius: 0 },
  rowText: { flex: 1, minWidth: 0, gap: 1 },
  rowTitle: { fontSize: 13.5, fontWeight: "600" },
  rowSub: { fontSize: 12 },
  progress: { height: 4, borderRadius: 0, overflow: "hidden" },
  empty: { alignItems: "center", justifyContent: "center", gap: 10, padding: 28 },
});
