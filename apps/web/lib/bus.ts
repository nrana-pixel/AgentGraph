import { useEffect } from "react";

type Handler = (payload?: unknown) => void;
const subs: Record<string, Handler[]> = {};

const bus = {
  on(ev: string, fn: Handler) {
    (subs[ev] = subs[ev] ?? []).push(fn);
    return () => {
      subs[ev] = (subs[ev] ?? []).filter((f) => f !== fn);
    };
  },
  emit(ev: string, payload?: unknown) {
    (subs[ev] ?? []).forEach((fn) => fn(payload));
  },
};

export function useBus() {
  return bus;
}

export function useBusEvent(ev: string, fn: Handler, deps: unknown[] = []) {
  useEffect(() => bus.on(ev, fn), deps);
}
