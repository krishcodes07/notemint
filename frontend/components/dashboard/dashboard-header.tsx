"use client";

import Link from "next/link";
import { Leaf } from "lucide-react";
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
        <Link
          href="/dashboard"
          className="flex items-center gap-2 font-semibold md:hidden"
        >
          <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Leaf className="size-3.5" />
          </span>
          <span className="text-sm font-bold tracking-tight">NoteMint</span>
        </Link>
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

