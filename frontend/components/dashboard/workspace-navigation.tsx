"use client";

import {
  BookOpen,
  CheckCircle2,
  HelpCircle,
  Home,
  Layers,
  Sparkles,
  LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type WorkspaceTab =
  | "home"
  | "notes"
  | "questions"
  | "flashcards"
  | "quiz"
  | "ai-talk";

interface NavItem {
  id: WorkspaceTab;
  label: string;
  shortLabel: string;
  icon: LucideIcon;
}

const NAV_ITEMS: NavItem[] = [
  { id: "home", label: "Home", shortLabel: "Home", icon: Home },
  { id: "notes", label: "Notes", shortLabel: "Notes", icon: BookOpen },
  { id: "questions", label: "Questions", shortLabel: "Q&A", icon: HelpCircle },
  { id: "flashcards", label: "Flashcards", shortLabel: "Cards", icon: Layers },
  { id: "quiz", label: "Quiz", shortLabel: "Quiz", icon: CheckCircle2 },
  { id: "ai-talk", label: "AI Talk", shortLabel: "Tutor", icon: Sparkles },
];

interface WorkspaceNavigationProps {
  activeTab: WorkspaceTab;
  onTabChange: (tab: WorkspaceTab) => void;
  className?: string;
}

export function WorkspaceNavigation({
  activeTab,
  onTabChange,
  className,
}: WorkspaceNavigationProps) {
  return (
    <div
      className={cn(
        "sticky bottom-2 z-30 mx-auto w-fit max-w-[calc(100vw-0.75rem)] px-1 sm:bottom-3 sm:max-w-[95vw] sm:px-2 py-1 mb-[env(safe-area-inset-bottom,0px)]",
        className
      )}
    >
      <nav
        aria-label="Study workspace tools"
        className="flex items-center gap-0.5 sm:gap-1.5 rounded-2xl border border-border/80 bg-background/95 p-1 sm:p-1.5 shadow-lg backdrop-blur-md transition-all overflow-x-auto no-scrollbar"
      >
        {NAV_ITEMS.map((item, index) => {
          const isActive = activeTab === item.id;
          const Icon = item.icon;

          return (
            <div key={item.id} className="flex items-center shrink-0">
              {index === 1 && (
                <div className="h-3.5 sm:h-4 w-px bg-border/70 mx-0.5 sm:mx-1 shrink-0" />
              )}
              <button
                type="button"
                onClick={() => onTabChange(item.id)}
                className={cn(
                  "group relative flex items-center gap-1 sm:gap-1.5 rounded-xl px-2 py-1 sm:px-3 sm:py-2 text-[11px] sm:text-xs font-medium transition-all shrink-0",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-xs font-semibold"
                    : "text-muted-foreground hover:bg-muted/80 hover:text-foreground active:scale-95"
                )}
                aria-current={isActive ? "page" : undefined}
              >
                <Icon
                  className={cn(
                    "size-3 sm:size-4 shrink-0 transition-transform",
                    isActive
                      ? "text-primary-foreground"
                      : "text-muted-foreground group-hover:text-foreground"
                  )}
                />
                <span className="tracking-tight hidden sm:inline">{item.label}</span>
                <span className="tracking-tight sm:hidden">{item.shortLabel}</span>
              </button>
            </div>
          );
        })}
      </nav>
    </div>
  );
}

