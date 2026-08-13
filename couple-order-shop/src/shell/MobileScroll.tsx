import type { PropsWithChildren } from "react";

/**
 * Native scrolling.
 *
 * The prototype's `MobileScroll` is 466 lines of pointer maths that reproduces
 * momentum and rubber-banding for a mouse on a desktop. A phone already has
 * all of that in hardware, and doing it in JavaScript on top would be both
 * slower and slightly wrong.
 *
 * What is worth keeping is `overscroll-behavior: contain`, so a scroll that
 * runs off the end of this element does not start pulling the page behind it.
 */
export function MobileScroll({ className, children }: PropsWithChildren<{ className?: string }>) {
  return (
    <div className={`app-scroll ${className ?? ""}`.trim()} data-testid="app-scroll">
      {children}
    </div>
  );
}
