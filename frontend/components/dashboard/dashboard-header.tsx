"use client";

import { NoteMintLogo } from "@/components/brand/logo";
import { MobileSidebar } from "@/components/dashboard/mobile-sidebar";
import { ThemeToggle } from "@/components/theme-toggle";

interface DashboardHeaderProps {
  title?: string;
  subtitle?: string;
}

export function DashboardHeader({ title }: DashboardHeaderProps) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4 transition-colors md:px-6 bg-background">
      {/* Mobile menu trigger & brand */}
      <div className="flex items-center gap-3">
        <MobileSidebar />
        <div className="md:hidden">
          <NoteMintLogo size="sm" href="/dashboard" />
        </div>
        {title && (
          <span className="hidden text-xs font-semibold uppercase tracking-wider text-muted-foreground md:inline">
            {title}
          </span>
        )}
      </div>

      {/* Top right quick controls */}
      <div className="flex items-center gap-3">
        <ThemeToggle />
      </div>
    </header>
  );
}
