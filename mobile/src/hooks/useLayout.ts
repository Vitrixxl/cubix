import { useWindowDimensions } from "react-native";
import { isPhone } from "../../../src/client/lib/viewport";

/**
 * The window's size and the web stylesheet's phone breakpoint (`@media (max-width: 700px)`). Wider than a phone, the
 * app is on a tablet or a small screen (the web serves it there too, boot.ts): `tablet` lays pages out in columns, and
 * `wide` (a tablet held sideways, a laptop) keeps a page's side panel docked beside it instead of in a sheet.
 */
export function useLayout() {
  const { width, height } = useWindowDimensions();
  const phone = isPhone(width);
  return { width, height, phone, tablet: !phone, wide: !phone && width >= 1100 };
}
