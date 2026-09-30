/** Visual primitives and page building blocks shared by every screen. */
import React, { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { store as s } from "./store";
import { Cube } from "./Cube";

export function Icon({ name, size = 16 }: { name: string; size?: number }) {
  return <span aria-hidden="true" className="icon" style={{
    width: size, height: size, maskImage: `url(../assets/icons/${name}.svg)`,
  }} />;
}

function ActionButton({icon, children, className = "", ...props}:
  React.ButtonHTMLAttributes<HTMLButtonElement> & {icon?: string}) {
  return <button type="button" {...props} className={`button ${className}`}>
    {icon && <Icon name={icon} />} {children}
  </button>;
}
export type Props = {
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
};

export function Button({
  action,
  children,
  active = false,
  icon,
  className = "",
  style,
  title,
  disabled = false,
  highlight,
}: {
  action: string;
  active?: boolean;
  /**
   * Animated active background: a layout id makes it glide between the buttons sharing it,
   * `true` fades it in and out on a lone toggle.
   */
  highlight?: string | boolean;
  icon?: string;
  title?: string;
  disabled?: boolean;
} & Props) {
  return (
    <ActionButton
      icon={icon}
      data-action={action}
      title={title ?? (typeof children === "string" ? children : action)}
      aria-label={title ?? (typeof children === "string" ? children : action)}
      className={`${active ? "active" : ""} ${highlight ? "highlighted" : ""} ${className}`}
      style={style}
      disabled={disabled}
      onClick={(e) => {
        e.currentTarget.blur();
        void s.action(action, e.currentTarget);
      }}
    >
      {typeof highlight === "string" ? (
        active && (
          <motion.span
            layoutId={highlight}
            className="button-highlight"
            transition={HIGHLIGHT}
          />
        )
      ) : (
        highlight && (
          <AnimatePresence initial={false}>
            {active && (
              <motion.span
                className="button-highlight"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={HIGHLIGHT}
              />
            )}
          </AnimatePresence>
        )
      )}
      {children}
    </ActionButton>
  );
}

const HIGHLIGHT = { type: "spring", bounce: 0.18, duration: 0.4 } as const;

export function Row({ children, className = "", style }: Props) {
  return (
    <div className={"row " + className} style={style}>
      {children}
    </div>
  );
}

export function Empty({ children }: Props) {
  return <div className="empty">{children}</div>;
}

export function Diagram({ c, size = 96 }: { c: any; size?: number }) {
  if (!c) return null;
  return c.cube ? (
    <Cube scene={c.cube} size={size} animated={false} />
  ) : (
    <img
      className="diagram"
      src={"../assets/" + c.asset}
      width={size}
      height={size}
      alt={c.id}
    />
  );
}

/** The face a cube move turns (R, Rw, 3Rw2, r…), for its sticker colour: null for any other notation. */
const faceOf = (move: string) => /^\d*([URFDLB])w?[2']*$/.exec(move)?.[1] ?? /^([urfdlb])[2']*$/.exec(move)?.[1].toUpperCase() ?? null;

/** Moves in notation. With `faces`, each cube move is marked with the colour of the face it turns. */
export function Alg({ text, size = 18, faces = false }: { text: string; size?: number; faces?: boolean }) {
  return (
    <div className={"alg mono" + (faces ? " faces" : "")} style={{ fontSize: size }}>
      {text?.split(/\s+/).map((word, i) => (
        <span key={i} className={/[()\[\]]/.test(word) ? "muted" : ""} data-face={faces ? faceOf(word) ?? undefined : undefined}>
          {word}
        </span>
      ))}
    </div>
  );
}

export const MOBILE = 700;

/** The app-wide puzzle, shown in page headers on phones where there is no rail. */
function PuzzleControl() {
  return (
    <Button action="menu:puzzles" className={"control head-puzzle " + (s.overlay === "puzzles" ? "open" : "")} title="Choose a puzzle">
      <Icon name={"Puzzle" + s.event().id} size={16} />
      {s.event().label}
      <Icon name="IconChevronDown" size={12} />
    </Button>
  );
}

/** Every page starts with the same row: title on the left, the page controls on the right. */
export function PageHead({
  title,
  sub,
  lead,
  puzzle = false,
  children,
}: { title: React.ReactNode; sub?: React.ReactNode; lead?: React.ReactNode; puzzle?: boolean } & Props) {
  const mobile = useViewport().w <= MOBILE;
  // Phones share the controls' row equally; the puzzle cell above is as wide as one of them, so their lines meet.
  const flat = (nodes: React.ReactNode): React.ReactNode[] =>
      React.Children.toArray(nodes).flatMap((n) => (React.isValidElement(n) && n.type === React.Fragment ? flat((n.props as Props).children) : [n])),
    // A group of cells (the cross + 1 moves) takes two shares.
    controls = flat(children)
      .filter((n) => React.isValidElement(n) && (n.props as Props).className !== "control-gap")
      .reduce((sum: number, n) => sum + (((n as React.ReactElement).props as Props).className === "segmented" ? 2 : 1), 0);
  return (
    <header className="page-head" style={{ "--controls": Math.max(1, controls) } as React.CSSProperties}>
      <div className="page-title">
        {lead}
        <div className="page-title-text">
          <h1>{title}</h1>
          {sub && <span className="page-sub">{sub}</span>}
        </div>
        {mobile && puzzle && <PuzzleControl />}
      </div>
      {React.Children.toArray(children).some(Boolean) && <div className="page-controls">{children}</div>}
    </header>
  );
}

/** A menu trigger of the page header: current value and a chevron. */
export function Menu({ action, children, icon }: { action: string; icon?: string } & Props) {
  return (
    <Button action={"menu:" + action} className={"control " + (s.overlay === action ? "open" : "")} icon={icon}>
      {children}
      <Icon name="IconChevronDown" size={12} />
    </Button>
  );
}

export function Avatar({ user, size = 60 }: { user: any; size?: number }) {
  return (
    <div
      className="avatar"
      style={{ width: size, height: size, fontSize: size / 3 }}
    >
      {user?.username?.slice(0, 2).toUpperCase()}
    </div>
  );
}

export function useViewport() {
  const [v, set] = useState({ w: innerWidth, h: innerHeight });
  useEffect(() => {
    const resize = () => set({ w: innerWidth, h: innerHeight });
    addEventListener("resize", resize);
    return () => removeEventListener("resize", resize);
  }, []);
  return v;
}

export const plural = (count: number, noun: string) =>
  `${count.toLocaleString()} ${noun}${count === 1 ? "" : "s"}`;

export function Progress({ ratio, done = true }: { ratio: number; done?: boolean }) {
  return (
    <div
      className={"progress " + (done ? "unlocked" : "")}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(Math.max(0, Math.min(1, ratio)) * 100)}
    >
      <div style={{ width: Math.max(0, Math.min(1, ratio)) * 100 + "%" }} />
    </div>
  );
}
