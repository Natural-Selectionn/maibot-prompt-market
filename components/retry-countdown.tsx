"use client";

import { useEffect, useState } from "react";

// Key this component by its deadline so a new cooldown gets a fresh clock.
export function RetryCountdown({ untilMs }: { untilMs: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => {
      const next = Date.now();
      setNow(next);
      if (next >= untilMs) window.clearInterval(timer);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [untilMs]);
  const seconds = Math.max(0, Math.ceil((untilMs - now) / 1000));
  return seconds > 0 ? <span>故障或限流暂缓<strong>约 {seconds} 秒后重试</strong></span> : null;
}
