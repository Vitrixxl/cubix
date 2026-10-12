/**
 * The phone layout's widest window, in CSS pixels: the web stylesheet's `md` breakpoint (`--breakpoint-md`, 701px)
 * starts one pixel above it, and the Android app reads the same width.
 */
export const PHONE_MAX_WIDTH = 700;

/** Whether a window this wide gets the phone layout (tab bar, one column). */
export const isPhone = (width: number) => width <= PHONE_MAX_WIDTH;

/**
 * Whether a window wider than a phone is still small: a tablet, a laptop's screen, a window put aside. On the web it
 * gets the phone app, laid out for its width (mobile/src/hooks/useLayout.ts); big screens keep the desktop app.
 */
export const isCompact = (width: number, height: number) => !isPhone(width) && (width < 1440 || height < 800);
