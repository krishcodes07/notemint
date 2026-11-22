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
    <header className="flex h-14 shrink-0 items-center justify-between border-b px-4 transition-colors md:px-6">
      {/* Mobile menu trigger & brand */}
      <div className="flex items-center gap-3">
        <MobileSidebar />
        <div className="md:hidden">
          <NoteMintLogo size="sm" href="/dashboard" />
        </div>
        {title && (
          <span className="hidden text-sm font-medium text-muted-foreground md:inline">
            {title}
          </span>
        )}
      </div>

      {/* Top right quick controls */}
      <div className="flex items-center gap-2">
        <ThemeToggle />
      </div>
    </header>
  );
}

