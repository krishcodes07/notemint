"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AuthControls } from "@/components/auth-controls";
import { NoteMintLogo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";

export function SiteHeader() {
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 15);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();

    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 w-full transition-all duration-300 ${
        isScrolled
          ? "border-b border-border/80 bg-background/95 backdrop-blur-md shadow-xs"
          : "border-b border-border/40 bg-background/80 backdrop-blur-sm"
      }`}
    >
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-10">
          <NoteMintLogo size="md" />

          <nav className="hidden items-center gap-7 text-sm font-medium text-muted-foreground md:flex">
            <Link
              href="#preview"
              className="transition-colors hover:text-foreground"
            >
              Study Studio
            </Link>
            <Link
              href="#workflow"
              className="transition-colors hover:text-foreground"
            >
              How it works
            </Link>
            <Link
              href="#comparison"
              className="transition-colors hover:text-foreground"
            >
              Why NoteMint
            </Link>
            <Link
              href="/dashboard/study/life-processes"
              className="transition-colors hover:text-foreground"
            >
              Interactive Demo
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-4">
          <AuthControls />
          <div className="h-4 w-px bg-border/80" aria-hidden />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
