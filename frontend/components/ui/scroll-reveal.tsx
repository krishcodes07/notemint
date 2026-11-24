"use client";

import React, { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type AnimationVariant =
  | "fade-up"
  | "fade-down"
  | "fade-left"
  | "fade-right"
  | "zoom-in"
  | "blur-up";

interface ScrollRevealProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  animation?: AnimationVariant;
  delayMs?: number;
  durationMs?: number;
  threshold?: number;
  once?: boolean;
  className?: string;
}

export function ScrollReveal({
  children,
  animation = "fade-up",
  delayMs = 0,
  durationMs = 700,
  threshold = 0.12,
  once = true,
  className,
  ...props
}: ScrollRevealProps) {
  const [isVisible, setIsVisible] = useState(false);
  const elementRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = elementRef.current;
    if (!el) return;

    // Check for reduced motion preference
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setIsVisible(true);
      return;
    }

    if (!("IntersectionObserver" in window)) {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          if (once) {
            observer.unobserve(el);
          }
        } else if (!once) {
          setIsVisible(false);
        }
      },
      {
        threshold,
        rootMargin: "0px 0px -40px 0px",
      }
    );

    observer.observe(el);

    return () => {
      observer.disconnect();
    };
  }, [threshold, once]);

  // Initial hidden states
  const getHiddenClasses = () => {
    switch (animation) {
      case "fade-up":
        return "opacity-0 translate-y-7";
      case "fade-down":
        return "opacity-0 -translate-y-7";
      case "fade-left":
        return "opacity-0 translate-x-7";
      case "fade-right":
        return "opacity-0 -translate-x-7";
      case "zoom-in":
        return "opacity-0 scale-[0.96]";
      case "blur-up":
        return "opacity-0 translate-y-6 blur-[6px]";
      default:
        return "opacity-0 translate-y-7";
    }
  };

  // Revealed states
  const getVisibleClasses = () => {
    switch (animation) {
      case "zoom-in":
        return "opacity-100 scale-100";
      case "blur-up":
        return "opacity-100 translate-y-0 blur-0";
      default:
        return "opacity-100 translate-y-0 translate-x-0";
    }
  };

  return (
    <div
      ref={elementRef}
      className={cn(
        "will-change-transform transform-gpu transition-all ease-[cubic-bezier(0.16,1,0.3,1)]",
        isVisible ? getVisibleClasses() : getHiddenClasses(),
        className
      )}
      style={{
        transitionDuration: `${durationMs}ms`,
        transitionDelay: `${delayMs}ms`,
      }}
      {...props}
    >
      {children}
    </div>
  );
}

/**
 * Staggered container for child items with sequential reveal delays
 */
export function ScrollRevealGroup({
  children,
  staggerDelayMs = 90,
  animation = "fade-up",
  className,
}: {
  children: React.ReactNode;
  staggerDelayMs?: number;
  animation?: AnimationVariant;
  className?: string;
}) {
  const items = React.Children.toArray(children);

  return (
    <div className={className}>
      {items.map((child, index) => (
        <ScrollReveal
          key={index}
          animation={animation}
          delayMs={index * staggerDelayMs}
        >
          {child}
        </ScrollReveal>
      ))}
    </div>
  );
}

