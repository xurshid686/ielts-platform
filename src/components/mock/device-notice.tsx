"use client";

import { useSyncExternalStore } from "react";
import { Laptop } from "lucide-react";
import { isExamCapableDevice } from "@/lib/mock-shared";

function readCapable(): boolean {
  return isExamCapableDevice({
    finePointer: window.matchMedia("(pointer: fine)").matches,
    anyFinePointer: window.matchMedia("(any-pointer: fine)").matches,
    screenW: window.screen.width,
    screenH: window.screen.height,
    fullscreenEnabled: !!document.fullscreenEnabled,
  });
}

const subscribe = () => () => {};

/**
 * Shows its children (the Start button) only on a laptop/desktop that can run
 * the fullscreen exam; otherwise says why. Starting the mock begins the
 * Listening clock, so a student on a phone must be stopped BEFORE that, not
 * after. The section page's ExamGuard applies the same rule again.
 */
export function DeviceNotice({ children }: { children: React.ReactNode }) {
  // null on the server render; the real answer after hydration.
  const capable = useSyncExternalStore(subscribe, readCapable, () => null);
  if (capable === null) return null;
  if (capable) return <>{children}</>;
  return (
    <p className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/5 px-3 py-2 text-sm">
      <Laptop className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
      This device can&apos;t run the mock exam. Open this page on a laptop or desktop computer (Chrome, Edge or Firefox)
      to start — your place is kept.
    </p>
  );
}
