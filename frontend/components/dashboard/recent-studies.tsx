"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, FileText } from "lucide-react";
import { getRecentStudies } from "@/lib/mock-study-data";
import { cn } from "@/lib/utils";

interface RecentStudiesProps {
  onSelect?: () => void;
  className?: string;
}

export function RecentStudies({ onSelect, className }: RecentStudiesProps) {
  const pathname = usePathname();
  const studies = getRecentStudies();

  if (studies.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border/80 p-4 text-center">
        <p className="text-xs text-muted-foreground">No recent studies yet.</p>
      </div>
    );
  }

  return (
    <nav className={cn("flex flex-col gap-1", className)} aria-label="Recent study materials">
      {studies.map((study) => {
        const href = `/dashboard/study/${study.id}`;
        const isActive = pathname === href;

        return (
          <Link
            key={study.id}
            href={href}
            onClick={onSelect}
            className={cn(
              "group flex items-center justify-between gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
              isActive
                ? "bg-brand-soft text-brand-foreground font-semibold dark:bg-brand-soft/30 dark:text-brand-primary"
                : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"
            )}
            title={`${study.title} (${study.subject})`}
          >
            <div className="flex min-w-0 items-center gap-2">
              <span
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded transition-colors",
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground group-hover:text-foreground"
                )}
                aria-hidden
              >
                {isActive ? (
                  <BookOpen className="size-3.5" />
                ) : (
                  <FileText className="size-3.5" />
                )}
              </span>
              <span className="truncate">{study.title}</span>
            </div>
            <span className="shrink-0 text-[10px] text-muted-foreground/80 opacity-0 transition-opacity group-hover:opacity-100">
              {study.lastStudied}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

