"use client";

import { useState } from "react";
import Link from "next/link";
import { Leaf, Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RecentStudies } from "@/components/dashboard/recent-studies";
import { SidebarUser } from "@/components/dashboard/sidebar-user";
import { NewStudyDialog } from "@/components/dashboard/new-study-dialog";
import { cn } from "@/lib/utils";

interface AppSidebarProps {
  onSelectStudy?: () => void;
  className?: string;
}

export function AppSidebar({ onSelectStudy, className }: AppSidebarProps) {
  const [newDialogOpen, setNewDialogOpen] = useState(false);

  return (
    <>
      <aside
        className={cn(
          "flex h-full w-64 flex-col justify-between border-r bg-sidebar p-3 text-sidebar-foreground transition-all duration-200 select-none",
          className
        )}
      >
        {/* Top brand & New action */}
        <div className="flex flex-col gap-4">
          {/* Brand header */}
          <div className="flex items-center justify-between px-2 pt-1">
            <Link
              href="/dashboard"
              className="flex items-center gap-2 font-semibold tracking-tight transition-opacity hover:opacity-85"
            >
              <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-xs">
                <Leaf className="size-4" />
              </span>
              <span className="text-base font-bold tracking-tight text-foreground">
                NoteMint
              </span>
            </Link>
          </div>

          {/* New Button matching sketch "<> New" */}
          <div className="px-1">
            <Button
              onClick={() => setNewDialogOpen(true)}
              variant="outline"
              className="group flex w-full items-center justify-start gap-2.5 rounded-xl border border-border/80 bg-background/50 px-3 py-2 text-xs font-semibold text-foreground shadow-xs transition-all hover:border-primary/50 hover:bg-brand-soft/20 hover:text-primary active:scale-[0.98]"
            >
              <span className="flex size-5 items-center justify-center rounded-md bg-brand-soft text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                <Plus className="size-3.5 stroke-[2.5]" />
              </span>
              <span>New</span>
              <span className="ml-auto text-[10px] text-muted-foreground/80 font-mono">
                Topic
              </span>
            </Button>
          </div>

          {/* Recent list section */}
          <div className="flex flex-col gap-2 px-1 pt-2">
            <div className="flex items-center justify-between px-2">
              <span className="text-xs font-bold tracking-wider uppercase text-muted-foreground">
                Recent
              </span>
              <Sparkles className="size-3 text-muted-foreground/60" />
            </div>
            <RecentStudies onSelect={onSelectStudy} />
          </div>
        </div>

        {/* Bottom section with user profile */}
        <div className="border-t border-border/60 pt-2 px-1">
          <SidebarUser />
        </div>
      </aside>

      <NewStudyDialog
        open={newDialogOpen}
        onOpenChange={setNewDialogOpen}
      />
    </>
  );
}

