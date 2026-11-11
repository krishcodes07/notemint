"use client";

import Link from "next/link";
import { ArrowLeft, BookOpen } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MobileSidebar } from "@/components/dashboard/mobile-sidebar";
import { ThemeToggle } from "@/components/theme-toggle";

interface WorkspaceHeaderProps {
  title: string;
  subject?: string;
  classLevel?: string;
}

export function WorkspaceHeader({
  title,
  subject,
  classLevel,
}: WorkspaceHeaderProps) {
  return (
    <header className="sticky top-0 z-20 shrink-0 border-b bg-background/95 backdrop-blur-xs">
      <div className="flex h-14 items-center justify-between px-3 md:px-6">
        {/* Left: Mobile menu trigger + Back to Dashboard */}
        <div className="flex items-center gap-2">
          <MobileSidebar />
          <Button
            variant="ghost"
            size="sm"
            asChild
            className="h-8 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
          >
            <Link href="/dashboard">
              <ArrowLeft className="size-3.5" />
              <span className="hidden sm:inline">Dashboard</span>
            </Link>
          </Button>
        </div>

        {/* Center: Title matching sketch */}
        <div className="flex flex-col items-center justify-center text-center">
          <div className="flex items-center gap-2">
            <h1 className="text-base font-bold tracking-tight text-foreground sm:text-lg md:text-xl">
              {title}
            </h1>
            {subject && (
              <Badge
                variant="secondary"
                className="hidden text-[10px] font-medium sm:inline-flex"
              >
                {subject} {classLevel ? `· ${classLevel}` : ""}
              </Badge>
            )}
          </div>
        </div>

        {/* Right: Quick actions & Theme toggle */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon-sm"
            className="hidden sm:inline-flex"
            title="Active Study Mode"
          >
            <BookOpen className="size-4 text-primary" />
          </Button>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

