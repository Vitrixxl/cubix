import { useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, Animated, PanResponder, ScrollView, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../theme";

const ROW_HEIGHT = 64;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
type Drag = { groups: string[]; from: number; to: number; startScroll: number; dy: number; pointerY: number; moved: boolean };

/** A handle owns the touch until release; the rest of each row still scrolls normally. */
export function LearningGroups({ groups, disabled = false, onReorder }: {
  groups: string[]; disabled?: boolean; onReorder: (groups: string[]) => void;
}) {
  const t = useTheme();
  const scroll = useRef<ScrollView>(null);
  const viewport = useRef<View>(null);
  const geometry = useRef({ top: 0, height: 0, offset: 0 });
  const drag = useRef<Drag | null>(null);
  const translateY = useRef(new Animated.Value(0)).current;
  const [preview, setPreview] = useState<{ from: number; to: number } | null>(null);
  const dragging = preview !== null;

  const measure = () => viewport.current?.measureInWindow((_, y, __, height) => {
    geometry.current.top = y;
    geometry.current.height = height;
  });
  const update = () => {
    const current = drag.current;
    if (!current?.moved) return;
    const dy = clamp(current.dy + geometry.current.offset - current.startScroll,
      -current.from * ROW_HEIGHT, (current.groups.length - 1 - current.from) * ROW_HEIGHT);
    translateY.setValue(dy);
    const to = current.from + Math.round(dy / ROW_HEIGHT);
    if (to !== current.to) {
      current.to = to;
      setPreview({ from: current.from, to });
    }
  };
  const finish = (commit: boolean) => {
    const current = drag.current;
    drag.current = null;
    setPreview(null);
    translateY.setValue(0);
    if (!commit || disabled || !current || current.from === current.to) return;
    const next = [...current.groups];
    const [group] = next.splice(current.from, 1);
    next.splice(current.to, 0, group!);
    onReorder(next);
    AccessibilityInfo.announceForAccessibility(`${group}, position ${current.to + 1} of ${next.length}`);
  };
  const start = (from: number, pointerY: number) => {
    if (disabled || drag.current) return;
    measure();
    drag.current = { groups: [...groups], from, to: from, startScroll: geometry.current.offset, dy: 0, pointerY, moved: false };
    setPreview({ from, to: from });
  };
  const move = (dy: number, pointerY: number) => {
    if (!drag.current) return;
    drag.current.dy = dy;
    drag.current.pointerY = pointerY;
    drag.current.moved ||= Math.abs(dy) >= 4;
    update();
  };
  // Keep the interval and native responder callbacks attached to the latest props.
  const latest = useRef({ update, finish });
  latest.current = { update, finish };
  useEffect(() => {
    if (drag.current && (disabled || groups.some((group, i) => group !== drag.current!.groups[i]) || groups.length !== drag.current.groups.length)) latest.current.finish(false);
  }, [disabled, groups]);
  useEffect(() => {
    if (!dragging) return;
    const timer = setInterval(() => {
      const current = drag.current;
      const { top, height, offset } = geometry.current;
      if (!current?.moved || height <= 0) return;
      const edge = Math.min(48, height / 4);
      const y = current.pointerY - top;
      const speed = y < edge ? -clamp((edge - y) / edge, 0, 1) : y > height - edge ? clamp((y - height + edge) / edge, 0, 1) : 0;
      const next = clamp(offset + speed * 12, 0, Math.max(0, current.groups.length * ROW_HEIGHT - height));
      if (next === offset) return;
      geometry.current.offset = next;
      scroll.current?.scrollTo({ y: next, animated: false });
      latest.current.update();
    }, 32);
    return () => clearInterval(timer);
  }, [dragging]);

  const accessibleMove = (from: number, direction: number) => {
    const to = from + direction;
    if (disabled || drag.current || to < 0 || to >= groups.length) return;
    const next = [...groups];
    const [group] = next.splice(from, 1);
    next.splice(to, 0, group!);
    onReorder(next);
    scroll.current?.scrollTo({ y: Math.max(0, to * ROW_HEIGHT - geometry.current.height / 2), animated: true });
    AccessibilityInfo.announceForAccessibility(`${group}, position ${to + 1} of ${next.length}`);
  };

  return <View ref={viewport} collapsable={false} style={styles.viewport} onLayout={measure}>
    <ScrollView ref={scroll} style={styles.viewport} scrollEnabled={!dragging} bounces={false} removeClippedSubviews={false}
      onScroll={event => { geometry.current.offset = event.nativeEvent.contentOffset.y; update(); }} scrollEventThrottle={16}>
      {groups.map((group, index) => {
        const active = preview?.from === index;
        const shift = !preview || active ? 0 : preview.from < index && index <= preview.to ? -1 : preview.to <= index && index < preview.from ? 1 : 0;
        const position = active ? preview.to : index + shift;
        return <Animated.View key={group} style={[styles.row, {
          zIndex: active ? 1 : 0, elevation: active ? 4 : 0,
          transform: [{ translateY: active ? translateY : shift * ROW_HEIGHT }],
        }]}>
          <View style={[styles.card, { backgroundColor: active ? t.hover : t.surface, borderColor: active ? t.accent : t.line }]}>
            <Text style={[styles.number, { color: t.readableMuted }]}>{position + 1}.</Text>
            <Text numberOfLines={2} style={[styles.name, { color: t.text }]}>{group}</Text>
            <GroupHandle group={group} position={position} count={groups.length} disabled={disabled}
              start={y => start(index, y)} move={move} finish={finish} adjust={direction => accessibleMove(index, direction)} />
          </View>
        </Animated.View>;
      })}
    </ScrollView>
  </View>;
}

function GroupHandle(props: {
  group: string; position: number; count: number; disabled: boolean;
  start: (y: number) => void; move: (dy: number, y: number) => void; finish: (commit: boolean) => void; adjust: (direction: number) => void;
}) {
  const t = useTheme();
  const latest = useRef(props); latest.current = props;
  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => !latest.current.disabled,
    onPanResponderGrant: event => latest.current.start(event.nativeEvent.pageY),
    onPanResponderMove: (_, gesture) => latest.current.move(gesture.dy, gesture.moveY),
    onPanResponderRelease: () => latest.current.finish(true),
    onPanResponderTerminate: () => latest.current.finish(false),
    onPanResponderTerminationRequest: () => false,
  }), []);
  return <View {...responder.panHandlers} accessible accessibilityRole="adjustable" accessibilityLabel={`Move ${props.group}`}
    accessibilityHint="Drag up or down to reorder" accessibilityState={{ disabled: props.disabled }}
    accessibilityValue={{ min: 1, max: props.count, now: props.position + 1, text: `Position ${props.position + 1} of ${props.count}` }}
    accessibilityActions={[{ name: "decrement", label: "Move up" }, { name: "increment", label: "Move down" }]}
    onAccessibilityAction={event => { if (event.nativeEvent.actionName === "decrement") props.adjust(-1); else if (event.nativeEvent.actionName === "increment") props.adjust(1); }}
    style={[styles.handle, { opacity: props.disabled ? 0.35 : 1 }]}>
    <View style={styles.dots} pointerEvents="none">
      {Array.from({ length: 6 }, (_, index) => <View key={index} style={[styles.dot, { backgroundColor: t.readableMuted }]} />)}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  viewport: { flex: 1, minHeight: 0 },
  row: { height: ROW_HEIGHT, paddingVertical: 3 },
  card: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 12, paddingLeft: 12 },
  number: { width: 26, fontSize: 13, fontVariant: ["tabular-nums"] },
  name: { flex: 1, fontSize: 14 },
  handle: { width: 48, height: 52, alignItems: "center", justifyContent: "center" },
  dots: { width: 12, flexDirection: "row", flexWrap: "wrap", gap: 4 },
  dot: { width: 4, height: 4, borderRadius: 2 },
});
