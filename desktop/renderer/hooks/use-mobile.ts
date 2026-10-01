import * as React from "react"
import { isPhone, PHONE_MAX_WIDTH } from "../../../src/client/lib/viewport"

/** Whether the window gets the phone layout (shadcn's hook, on the app's breakpoint). */
export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${PHONE_MAX_WIDTH}px)`)
    const onChange = () => {
      setIsMobile(isPhone(window.innerWidth))
    }
    mql.addEventListener("change", onChange)
    setIsMobile(isPhone(window.innerWidth))
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return !!isMobile
}
