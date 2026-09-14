import { useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAtomValue } from "jotai";
import { keyboardVisibleAtom } from "../state";

/** Breakpoints of the web stylesheet. */
export function useLayout() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const keyboardVisible = useAtomValue(keyboardVisibleAtom);
  return {
    width, height, insets,
    /** `@media (max-width: 700px)` */
    phone: width <= 700,
    /** `@media (max-height: 700px)` */
    short: height <= 700,
    /** Practice panels become side rails instead of sheets. */
    wide: width >= 1024 && height >= 600,
    /** `@media (max-height: 500px) and (min-width: 560px)`: the practice stack becomes two columns. */
    landscape: height <= 500 && width >= 560,
    /** `--nav-space`: content padding under the floating navigation. */
    navSpace: keyboardVisible ? 16 : 72 + insets.bottom,
    pagePadding: width <= 700 ? 14 : 24,
  };
}
