"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface HorizontalScrollAreaProps {
  children: ReactNode;
  className?: string;
  ariaLabel: string;
  hint?: string;
}

/** Mobile overflow affordance with edge fades, snap scrolling and a one-time hint. */
export default function HorizontalScrollArea({
  children,
  className,
  ariaLabel,
  hint = "Swipe to browse",
}: HorizontalScrollAreaProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [overflowing, setOverflowing] = useState(false);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(true);
  const [interacted, setInteracted] = useState(false);

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const hasOverflow = el.scrollWidth > el.clientWidth + 2;
    setOverflowing(hasOverflow);
    setAtStart(el.scrollLeft <= 2);
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 2);
  }, []);

  useEffect(() => {
    measure();
    const observer = new ResizeObserver(measure);
    if (ref.current) observer.observe(ref.current);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [measure]);

  useEffect(() => {
    const el = ref.current;
    const current = el?.querySelector<HTMLElement>("[aria-current]");
    if (!el || !current) return;
    current.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "nearest",
      inline: "center",
    });
    requestAnimationFrame(measure);
  }, [measure]);

  const scrollByPage = (direction: -1 | 1) => {
    const el = ref.current;
    if (!el) return;
    setInteracted(true);
    el.scrollBy({
      left: direction * Math.max(180, el.clientWidth * 0.72),
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  };

  return (
    <div className="relative min-w-0">
      <div
        ref={ref}
        role="region"
        aria-label={ariaLabel}
        tabIndex={overflowing ? 0 : -1}
        onScroll={() => {
          setInteracted(true);
          measure();
        }}
        onPointerDown={() => setInteracted(true)}
        className={cn(
          "scroll-px-5 snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:thin]",
          className,
        )}
      >
        {children}
      </div>

      {overflowing && !atStart && (
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-10 bg-gradient-to-r from-white to-transparent md:hidden" />
      )}
      {overflowing && !atEnd && (
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-12 bg-gradient-to-l from-white to-transparent md:hidden" />
      )}

      {overflowing && (
        <div className="mt-2 flex items-center justify-between px-1 text-[11px] font-medium text-[#777b81] md:hidden">
          <span className={cn("transition-opacity", interacted && "opacity-0")} aria-hidden="true">
            {hint}
          </span>
          <span className="ml-auto flex items-center gap-1">
            <button
              type="button"
              aria-label={`Scroll ${ariaLabel.toLowerCase()} left`}
              disabled={atStart}
              onClick={() => scrollByPage(-1)}
              className="inline-flex h-11 w-11 touch-manipulation items-center justify-center rounded-full border border-black/10 bg-white text-[#393C41] hover:border-[#d4343e]/40 active:bg-[#f2f3f4] disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label={`Scroll ${ariaLabel.toLowerCase()} right`}
              disabled={atEnd}
              onClick={() => scrollByPage(1)}
              className="inline-flex h-11 w-11 touch-manipulation items-center justify-center rounded-full border border-black/10 bg-white text-[#393C41] hover:border-[#d4343e]/40 active:bg-[#f2f3f4] disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </span>
        </div>
      )}
    </div>
  );
}
