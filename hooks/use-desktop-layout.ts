"use client";

import { useSyncExternalStore } from "react";

const desktopQuery = "(min-width: 781px)";
function subscribe(callback: () => void) {
  const query = window.matchMedia(desktopQuery);
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

export function useDesktopLayout() {
  return useSyncExternalStore(subscribe, () => window.matchMedia(desktopQuery).matches, () => false);
}
