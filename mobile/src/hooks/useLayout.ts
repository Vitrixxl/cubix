import { useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAtomValue } from "jotai";
import { keyboardVisibleAtom } from "../state";

/** Breakpoints of the web stylesheet. */
export function useLayout() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const keyboardVisible = useAtomValue(keyboardVisibleAtom);
  const phone = width <= 700;
  /** Phones and short landscape screens place the navigation bar in the layout flow, under the content. */
  const navInFlow = phone || height <= 500;
  return {
    width, height, insets, navInFlow,
    /** `@media (max-width: 700px)` */
    phone,
    /** `@media (max-height: 700px)` */
    short: height <= 700,
    /** Practice panels become side rails instead of sheets. */
    wide: width >= 1024 && height >= 600,
    /** `@media (max-height: 500px) and (min-width: 560px)`: the practice stack becomes two columns. */
    landscape: height <= 500 && width >= 560,
    /** `--nav-space`: content padding under the floating navigation; a plain bottom margin when the bar is in the flow. */
    navSpace: keyboardVisible || navInFlow ? 16 : 72 + insets.bottom,
    pagePadding: phone ? 14 : 24,
  };
}
