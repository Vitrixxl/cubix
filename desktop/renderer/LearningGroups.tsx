import React, { useEffect, useRef, useState } from "react";
import { Reorder } from "motion/react";
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
    <Reorder.Group as="ol" axis="y" layoutScroll className="scroll learning-groups" aria-label="Learning group order" values={groups} onReorder={reorder}>
      {groups.map((group, index) => <GroupItem key={group} group={group} index={index} count={groups.length} start={() => { dragging.current = true; }} save={save} move={move} />)}
    </Reorder.Group>
    <span className="learning-order-announcement" role="status">{announcement}</span>
  </>;
}

function GroupItem({ group, index, count, start, save, move }: {
  group: string; index: number; count: number;
  save: (group: string) => void;
  start: () => void;
  move: (group: string, key: string) => void;
}) {
  return <Reorder.Item value={group} className="learning-group" onDragStart={start} onDragEnd={() => save(group)} whileDrag={{ boxShadow: "0 6px 20px #0004", borderColor: "var(--accent)" }}>
    <span className="learning-group-number" aria-hidden="true">{index + 1}.</span>
    <span className="learning-group-name">{group}</span>
    <button type="button" className="button learning-group-handle" aria-label={`Move ${group}`} aria-description={`Position ${index + 1} of ${count}. Drag or use the arrow keys, Home and End to reorder.`} aria-keyshortcuts="ArrowUp ArrowDown Home End" title="Drag to reorder · ↑ / ↓" onKeyDown={event => {
      if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      event.stopPropagation();
      const handle = event.currentTarget;
      move(group, event.key);
      requestAnimationFrame(() => handle.scrollIntoView({ block: "nearest" }));
    }}>
      <svg aria-hidden="true" width="18" height="24" viewBox="0 0 18 24" fill="currentColor">
        {[6, 12, 18].flatMap(y => [6, 12].map(x => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.5" />))}
      </svg>
    </button>
  </Reorder.Item>;
}
