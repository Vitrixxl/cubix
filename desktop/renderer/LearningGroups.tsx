import { useEffect, useRef, useState } from "react";
import { Reorder } from "motion/react";
import { GripVertical } from "lucide-react";
import { store as s } from "./store";

export function LearningGroups() {
  const [groups, setGroups] = useState(() => s.learningGroups);
  const current = useRef(groups);
  const dragging = useRef(false);
  const savedOrder = JSON.stringify(s.learningGroups);
  useEffect(() => {
    if (dragging.current) return;
    current.current = JSON.parse(savedOrder);
    setGroups(current.current);
  }, [savedOrder]);
  const [announcement, announce] = useState("");
  const reorder = (next: string[]) => {
    current.current = next;
    setGroups(next);
  };
  const save = (group: string) => {
    dragging.current = false;
    void s.reorderLearningGroups(current.current).catch(s.fail);
    announce(`${group}, position ${current.current.indexOf(group) + 1} of ${current.current.length}`);
  };
  const move = (group: string, key: string) => {
    const next = [...current.current];
    const index = next.indexOf(group);
    const target = key === "Home" ? 0 : key === "End" ? next.length - 1 : index + (key === "ArrowUp" ? -1 : 1);
    if (target < 0 || target >= next.length || target === index) return;
    next.splice(index, 1);
    next.splice(target, 0, group);
    reorder(next);
    save(group);
  };
  return <>
    <Reorder.Group as="ol" axis="y" layoutScroll className="-mx-2 flex max-h-[60vh] flex-col gap-0.5 overflow-y-auto px-2" aria-label="Learning group order" values={groups} onReorder={reorder}>
      {groups.map((group, index) => <GroupItem key={group} group={group} index={index} count={groups.length} start={() => { dragging.current = true; }} save={save} move={move} />)}
    </Reorder.Group>
    <span className="sr-only" role="status">{announcement}</span>
  </>;
}

function GroupItem({ group, index, count, start, save, move }: {
  group: string; index: number; count: number;
  save: (group: string) => void;
  start: () => void;
  move: (group: string, key: string) => void;
}) {
  return <Reorder.Item value={group} className="flex h-10 items-center gap-3 rounded-lg bg-popover pr-1 pl-3 hover:bg-muted/50" onDragStart={start} onDragEnd={() => save(group)} whileDrag={{ boxShadow: "0 8px 24px rgb(0 0 0 / 0.25)" }}>
    <span className="w-6 font-sans text-xs text-muted-foreground tabular-nums" aria-hidden="true">{index + 1}.</span>
    <span className="flex-1 truncate text-sm">{group}</span>
    <button type="button" className="flex size-8 cursor-grab items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 active:cursor-grabbing" aria-label={`Move ${group}`} aria-description={`Position ${index + 1} of ${count}. Drag or use the arrow keys, Home and End to reorder.`} aria-keyshortcuts="ArrowUp ArrowDown Home End" title="Drag to reorder · ↑ / ↓" onKeyDown={event => {
      if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      event.stopPropagation();
      const handle = event.currentTarget;
      move(group, event.key);
      requestAnimationFrame(() => handle.scrollIntoView({ block: "nearest" }));
    }}>
      <GripVertical className="size-4" aria-hidden="true" />
    </button>
  </Reorder.Item>;
}
