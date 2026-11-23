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
  icon: LucideIcon;
}

const NAV_ITEMS: NavItem[] = [
  { id: "home", label: "Home", icon: Home },
  { id: "notes", label: "Notes", icon: BookOpen },
  { id: "questions", label: "Questions", icon: HelpCircle },
  { id: "flashcards", label: "Flashcards", icon: Layers },
  { id: "quiz", label: "Quiz", icon: CheckCircle2 },
  { id: "ai-talk", label: "AI Talk", icon: Sparkles },
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
        "sticky bottom-3 z-30 mx-auto w-fit max-w-[95vw] px-2 py-1",
        className
      )}
    >
      <nav
        aria-label="Study workspace tools"
        className="flex items-center gap-1 rounded-2xl border border-border/80 bg-background/90 p-1.5 shadow-lg backdrop-blur-md transition-all sm:gap-1.5"
      >
        {NAV_ITEMS.map((item, index) => {
          const isActive = activeTab === item.id;
          const Icon = item.icon;

          return (
            <div key={item.id} className="flex items-center">
              {index === 1 && (
                <div className="h-4 w-px bg-border/70 mx-0.5 sm:mx-1" />
              )}
              <button
                type="button"
                onClick={() => onTabChange(item.id)}
                className={cn(
                  "group relative flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-medium transition-all sm:px-3 sm:py-2",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-xs font-semibold"
                    : "text-muted-foreground hover:bg-muted/80 hover:text-foreground active:scale-95"
                )}
                aria-current={isActive ? "page" : undefined}
              >
                <Icon
                  className={cn(
                    "size-3.5 shrink-0 transition-transform sm:size-4",
                    isActive
                      ? "text-primary-foreground"
                      : "text-muted-foreground group-hover:text-foreground"
                  )}
                />
                <span className="text-xs tracking-tight">{item.label}</span>
              </button>
            </div>
          );
        })}
      </nav>
    </div>
  );
}

