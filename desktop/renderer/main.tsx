/** The page's entry: the administration under /admin, the app everywhere else. Each loads only its own code, so the
 * administration never starts the app's data engine. */
import "./globals.css";

if (/^\/admin(\/|$)/.test(location.pathname)) void import("./admin/admin");
else void import("./app");
