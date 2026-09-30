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
    {icon && <Icon name={icon} size={15} />}
    {children}
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
      className={`${active ? "active" : ""} ${highlight ? "highlighted" : ""} ${icon && (children == null || children === false) ? "icon-only" : ""} ${className}`}
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

/**
 * Every page starts with the same header, drawn on the canvas rather than in a bar: the title and one short line
 * under it on the left, the page's controls on the right. Phones put the puzzle beside the title.
 */
export function PageHead({
  title,
  sub,
  lead,
  puzzle = false,
  children,
}: { title: React.ReactNode; sub?: React.ReactNode; lead?: React.ReactNode; puzzle?: boolean } & Props) {
  const mobile = useViewport().w <= MOBILE;
  return (
    <header className="page-head">
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

/** A pulsing block standing in for content that is on its way. */
export function Skeleton({ w = "100%", h = 14, className = "", style }: { w?: number | string; h?: number | string } & Props) {
  return <span className={"skeleton-line " + className} aria-hidden="true" style={{ width: w, height: h, ...style }} />;
}

/** A whole page on its way: its header and two panels, shaped like the pages they stand for. */
export function PageSkeleton({ side = true }: { side?: boolean }) {
  return (
    <div className="page page-skeleton" aria-busy="true" aria-label="Loading">
      <header className="page-head">
        <div className="page-title">
          <div className="page-title-text">
            <Skeleton w={160} h={26} />
            <Skeleton w={220} h={12} />
          </div>
        </div>
        <div className="page-controls">
          <Skeleton w={120} h={34} />
          <Skeleton w={96} h={34} />
        </div>
      </header>
      <div className="skeleton-body" style={{ gridTemplateColumns: side ? "minmax(0, 1fr) var(--side-width)" : "minmax(0, 1fr)" }}>
        <div className="panel skeleton-panel">
          <Skeleton w="30%" h={12} />
          <Skeleton w="85%" h={22} />
          <Skeleton w="60%" h={22} />
          <span className="skeleton-fill" />
          <Skeleton w="40%" h={72} style={{ alignSelf: "center" }} />
          <span className="skeleton-fill" />
        </div>
        {side && (
          <div className="panel skeleton-panel">
            <Skeleton w="40%" h={12} />
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} w="100%" h={18} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** The app's mark: four stickers, one of them turned to the accent. */
export function Logo({ size = 18 }: { size?: number }) {
  return (
    <svg className="logo" width={size} height={size} viewBox="0 0 18 18" aria-hidden="true">
      {[0, 1].flatMap((row) =>
        [0, 1].map((col) => (
          <rect
            key={row * 2 + col}
            x={col * 9.75}
            y={row * 9.75}
            width={8.25}
            height={8.25}
            rx={2.2}
            className={row === 0 && col === 1 ? "logo-accent" : undefined}
          />
        )),
      )}
    </svg>
  );
}

/** A menu trigger of the page header: current value and a chevron. */
export function Menu({ action, children, icon }: { action: string; icon?: string } & Props) {
  return (
    <Button action={"menu:" + action} className={"control menu-trigger " + (s.overlay === action ? "open" : "")} icon={icon}>
      <span className="menu-trigger-label">{children}</span>
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
