import { useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, Animated, PanResponder, ScrollView, Text, View } from "react-native";
import { tr } from "../../../src/client/i18n";

const ROW_HEIGHT = 64;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
type Drag = { groups: string[]; from: number; to: number; startScroll: number; dy: number; pointerY: number; moved: boolean };

/** A handle owns the touch until release; the rest of each row still scrolls normally. */
export function LearningGroups({ groups, disabled = false, onReorder }: {
  groups: string[]; disabled?: boolean; onReorder: (groups: string[]) => void;
}) {
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
    AccessibilityInfo.announceForAccessibility(tr("{0}, position {1} of {2}", { 0: group, 1: current.to + 1, 2: next.length }));
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
    AccessibilityInfo.announceForAccessibility(tr("{0}, position {1} of {2}", { 0: group, 1: to + 1, 2: next.length }));
  };

  return <View ref={viewport} collapsable={false} className="min-h-0 shrink" onLayout={measure}>
    <ScrollView ref={scroll} className="min-h-0 shrink grow-0" scrollEnabled={!dragging} bounces={false} removeClippedSubviews={false}
      onScroll={event => { geometry.current.offset = event.nativeEvent.contentOffset.y; update(); }} scrollEventThrottle={16}>
      {groups.map((group, index) => {
        const active = preview?.from === index;
        const shift = !preview || active ? 0 : preview.from < index && index <= preview.to ? -1 : preview.to <= index && index < preview.from ? 1 : 0;
        const position = active ? preview.to : index + shift;
        return <Animated.View key={group} style={{
          height: ROW_HEIGHT, paddingVertical: 4,
          zIndex: active ? 1 : 0, elevation: active ? 4 : 0,
          transform: [{ translateY: active ? translateY : shift * ROW_HEIGHT }],
        }}>
          <View className={active ? "flex-1 flex-row items-center gap-2.5 rounded-lg border border-primary bg-accent pl-3.5 pr-1.5" : "flex-1 flex-row items-center gap-2.5 rounded-lg border border-transparent bg-muted/50 pl-3.5 pr-1.5"}>
            <Text className="w-7 font-sans text-sm text-muted-foreground">{position + 1}.</Text>
            <Text numberOfLines={2} className="flex-1 font-sans text-sm text-foreground">{group}</Text>
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
  const latest = useRef(props); latest.current = props;
  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => !latest.current.disabled,
    onPanResponderGrant: event => latest.current.start(event.nativeEvent.pageY),
    onPanResponderMove: (_, gesture) => latest.current.move(gesture.dy, gesture.moveY),
    onPanResponderRelease: () => latest.current.finish(true),
    onPanResponderTerminate: () => latest.current.finish(false),
    onPanResponderTerminationRequest: () => false,
  }), []);
  return <View {...responder.panHandlers} accessible accessibilityRole="adjustable" accessibilityLabel={tr("Move {0}", { 0: props.group })}
    accessibilityHint={tr("Drag up or down to reorder")} accessibilityState={{ disabled: props.disabled }}
    accessibilityValue={{ min: 1, max: props.count, now: props.position + 1, text: tr("Position {0} of {1}", { 0: props.position + 1, 1: props.count }) }}
    accessibilityActions={[{ name: "decrement", label: tr("Move up") }, { name: "increment", label: tr("Move down") }]}
    onAccessibilityAction={event => { if (event.nativeEvent.actionName === "decrement") props.adjust(-1); else if (event.nativeEvent.actionName === "increment") props.adjust(1); }}
    className={props.disabled ? "size-11 items-center justify-center opacity-35" : "size-11 items-center justify-center"}>
    <View className="w-3 flex-row flex-wrap gap-1" pointerEvents="none">
      {Array.from({ length: 6 }, (_, index) => <View key={index} className="size-1 rounded-full bg-muted-foreground" />)}
    </View>
  </View>;
}
