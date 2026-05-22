import { useState, useId, useLayoutEffect, useRef } from "react";
import type { ReactNode } from "react";

export function Tooltip({ content, children }: { content: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [anchorRight, setAnchorRight] = useState(false);
  const bubbleRef = useRef<HTMLSpanElement | null>(null);
  const id = useId();

  useLayoutEffect(() => {
    if (!open) {
      setAnchorRight(false);
      return;
    }
    const node = bubbleRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const viewportRight = typeof window !== "undefined" ? window.innerWidth - 8 : rect.right;
    if (rect.right > viewportRight) {
      setAnchorRight(true);
    }
  }, [open]);

  if (!content) return <>{children}</>;
  return (
    <span
      className="tip-wrap"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      aria-describedby={open ? id : undefined}
    >
      {children}
      <span className="tip-indicator" aria-hidden="true">?</span>
      {open && (
        <span
          ref={bubbleRef}
          role="tooltip"
          id={id}
          className={`tip-bubble${anchorRight ? " tip-bubble--right" : ""}`}
        >
          {content}
        </span>
      )}
    </span>
  );
}
