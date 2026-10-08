import { useMemo, useRef, useState, type ReactNode } from "react";
import { PanResponder, View, type LayoutRectangle, type ViewStyle } from "react-native";
import { cn } from "@/lib/utils";

/**
 * A picture laid over a room and dragged anywhere in it (the web's coaching/movable.tsx on touch): one's own picture,
 * the floating call. Where it sits is kept as fractions of the room left around it (0 against the left or top, 1
 * against the right or bottom), so it keeps to its corner when the room changes size.
 */
export type Place = { x: number; y: number };

const clamp = (v: number) => Math.min(1, Math.max(0, v));

/**
 * The room (`className` and `style` place it; it lets touches through) and the picture in it, `width` wide at `ratio`
 * (width over height); `place` keeps where it is between mounts. A touch only becomes a drag past a few points, so the
 * buttons on the picture keep working.
 */
export function Movable({ place, width, ratio, className, style, frame, children }: { place: Place; width: number; ratio: number; className?: string; style?: ViewStyle; frame?: string; children: (at: Place) => ReactNode }) {
  const [room, setRoom] = useState<Pick<LayoutRectangle, "width" | "height">>({ width: 0, height: 0 });
  const [at, setAt] = useState(() => ({ ...place }));
  const now = useRef(at);
  now.current = at;
  const w = Math.min(width, room.width), h = w / ratio, spareW = room.width - w, spareH = room.height - h;
  const responder = useMemo(() => {
    let from = now.current;
    return PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.hypot(g.dx, g.dy) > 4,
      onPanResponderGrant: () => { from = now.current; },
      onPanResponderMove: (_, g) => {
        const next = { x: spareW > 0 ? clamp(from.x + g.dx / spareW) : 0, y: spareH > 0 ? clamp(from.y + g.dy / spareH) : 0 };
        Object.assign(place, next);
        setAt(next);
      },
    });
  }, [place, spareW, spareH]);
  return <View pointerEvents="box-none" className={cn("absolute", className)} style={style} onLayout={e => setRoom(e.nativeEvent.layout)}>
    {room.width ? <View {...responder.panHandlers} className={cn("absolute overflow-hidden", frame)}
      style={{ left: at.x * Math.max(0, spareW), top: at.y * Math.max(0, spareH), width: w, height: h }}>
      {children(at)}
    </View> : null}
  </View>;
}
