/** A font imported from a script is its address (desktop/web.ts). */
declare module "*.ttf" {
  const url: string;
  export default url;
}
