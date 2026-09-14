/** Tiny in-process event bus replacing the window events used by the web app. */
type Listener<T> = (value: T) => void;

export function createEvent<T = void>() {
  const listeners = new Set<Listener<T>>();
  return {
    emit: (value: T) => { for (const listener of [...listeners]) listener(value); },
    on: (listener: Listener<T>) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
}
