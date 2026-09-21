export interface Bridge {
  ready: () => Promise<void>;
  call: (method: string, ...args: any[]) => Promise<any>;
  open: (url: string) => Promise<void>;
  onEvent: (callback: (event: any) => void) => () => void;
}
declare global {
  interface Window {
    cubix: Bridge;
  }
}
export const call = (method: string, ...args: any[]) =>
  window.cubix.call(method, ...args);
