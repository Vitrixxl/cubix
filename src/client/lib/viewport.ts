/**
 * The phone layout's widest window, in CSS pixels: the web stylesheet's `md` breakpoint (`--breakpoint-md`, 701px)
 * starts one pixel above it, and the Android app reads the same width.
 */
export const PHONE_MAX_WIDTH = 700;

/** Whether a window this wide gets the phone layout (tab bar, one column). */
export const isPhone = (width: number) => width <= PHONE_MAX_WIDTH;

/** The smallest window the desktop app is laid out for (desktop/testing/responsive.ts checks it down to 1024×600). */
export const DESKTOP_MIN = { width: 1024, height: 600 } as const;

/**
 * Whether a window wider than a phone still gets the phone app on the web (laid out for its width,
 * mobile/src/hooks/useLayout.ts): a touch tablet (a coarse pointer, `finePointer` false) or a window under
 * {@link DESKTOP_MIN}. A laptop or a desktop with a mouse or a trackpad keeps the desktop app.
 */
export const isCompact = (width: number, height: number, finePointer: boolean) =>
  !isPhone(width) && (!finePointer || width < DESKTOP_MIN.width || height < DESKTOP_MIN.height);
