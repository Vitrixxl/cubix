/**
 * `CUBIX_DEV` is set by the build (desktop/web.ts `devTools`): only the development server's build has it. Test it
 * where it is used, as `typeof CUBIX_DEV !== "undefined" && CUBIX_DEV`: the bundler then drops the guarded code from
 * production, which a constant imported from here would not.
 */
declare global {
  const CUBIX_DEV: boolean | undefined;
}
export {};
