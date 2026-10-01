/**
 * The phone layout's widest window, in CSS pixels: the web stylesheet's `md` breakpoint (`--breakpoint-md`, 701px)
 * starts one pixel above it, and the Android app reads the same width.
 */
export const PHONE_MAX_WIDTH = 700;

/** Whether a window this wide gets the phone layout (tab bar, one column). */
export const isPhone = (width: number) => width <= PHONE_MAX_WIDTH;
