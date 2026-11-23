"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FolderOpen, LayoutDashboard, Plus } from "lucide-react";
import { NoteMintLogo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { RecentStudies } from "@/components/dashboard/recent-studies";
import { SidebarUser } from "@/components/dashboard/sidebar-user";
import { UploadDialog } from "@/components/dashboard/upload-dialog";
import { cn } from "@/lib/utils";

interface AppSidebarProps {
  onSelectStudy?: () => void;
  className?: string;
}

const DEFAULT_WIDTH = 256;
const MIN_WIDTH = 200;
const MAX_WIDTH = 480;

export function AppSidebar({ onSelectStudy, className }: AppSidebarProps) {
  const pathname = usePathname();
  const [newDialogOpen, setNewDialogOpen] = useState(false);

  const isMobileVariant = className?.includes("w-full");
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_WIDTH);
  const [isResizing, setIsResizing] = useState(false);

  // Load persisted width from localStorage on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const saved = localStorage.getItem("notemint_sidebar_width");
      if (saved) {
        const parsed = parseInt(saved, 10);
        if (!isNaN(parsed) && parsed >= MIN_WIDTH && parsed <= MAX_WIDTH) {
          setSidebarWidth(parsed);
        }
      }
    } catch {}
  }, []);

  const startResizing = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const stopResizing = useCallback(() => {
    setIsResizing(false);
  }, []);

  const resize = useCallback(
    (e: MouseEvent) => {
      if (isResizing) {
        const newWidth = Math.min(Math.max(e.clientX, MIN_WIDTH), MAX_WIDTH);
        setSidebarWidth(newWidth);
        try {
          localStorage.setItem("notemint_sidebar_width", newWidth.toString());
        } catch {}
      }
    },
    [isResizing]
  );

  const handleResetWidth = () => {
    setSidebarWidth(DEFAULT_WIDTH);
    try {
      localStorage.setItem("notemint_sidebar_width", DEFAULT_WIDTH.toString());
    } catch {}
  };

  useEffect(() => {
    if (isResizing) {
      document.body.style.userSelect = "none";
      document.body.style.cursor = "col-resize";
      window.addEventListener("mousemove", resize);
      window.addEventListener("mouseup", stopResizing);
    } else {
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      window.removeEventListener("mousemove", resize);
      window.removeEventListener("mouseup", stopResizing);
    }

    return () => {
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      window.removeEventListener("mousemove", resize);
      window.removeEventListener("mouseup", stopResizing);
    };
  }, [isResizing, resize, stopResizing]);

  const isDashboardActive = pathname === "/dashboard";

  return (
    <>
      <aside
        style={isMobileVariant ? undefined : { width: `${sidebarWidth}px` }}
        className={cn(
          "relative flex h-full max-h-screen flex-col overflow-hidden border-r border-border bg-sidebar p-3 text-sidebar-foreground select-none shrink-0",
          !isResizing && "transition-[width] duration-150 ease-out",
          className
        )}
      >
        {/* Top fixed section */}
        <div className="flex flex-col gap-4 shrink-0">
          {/* Brand header */}
          <div className="flex items-center justify-between px-2 pt-1.5">
            <NoteMintLogo size="md" href="/dashboard" />
          </div>

          {/* New Document Button */}
          <div className="px-1">
            <Button
              onClick={() => setNewDialogOpen(true)}
              className="group flex w-full items-center justify-center gap-2 rounded-full bg-foreground text-background px-4 py-2 text-xs font-semibold shadow-xs hover:bg-foreground/90 transition-all cursor-pointer"
            >
              <Plus className="size-3.5 stroke-[2.5]" />
              <span>Upload Document</span>
            </Button>
          </div>

          {/* Core Navigation Links */}
          <div className="px-1 space-y-1">
            <Link
              href="/dashboard"
              onClick={onSelectStudy}
              className={cn(
                "flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-xs font-semibold transition-colors",
                isDashboardActive
                  ? "bg-muted font-bold text-foreground"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              )}
            >
              <LayoutDashboard className="size-4" />
              <span>Dashboard</span>
            </Link>
          </div>
        </div>

        {/* Scrollable middle documents section */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden px-1 pt-3 my-2 border-t border-border/60">
          <div className="flex items-center justify-between px-2 mb-2 shrink-0">
            <span className="text-[11px] font-bold tracking-wider uppercase text-muted-foreground">
              Documents
            </span>
            <FolderOpen className="size-3 text-muted-foreground" />
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden no-scrollbar pr-0.5">
            <RecentStudies onSelect={onSelectStudy} />
          </div>
        </div>

        {/* Bottom pinned section with user profile */}
        <div className="border-t border-border/60 pt-2 px-1 shrink-0 mt-auto">
          <SidebarUser />
        </div>

        {/* Resize Handle (Desktop only) */}
        {!isMobileVariant && (
          <div
            onMouseDown={startResizing}
            onDoubleClick={handleResetWidth}
            title="Drag to resize sidebar (double-click to reset)"
            className={cn(
              "absolute top-0 -right-1.5 z-30 h-full w-3 cursor-col-resize select-none group hidden md:flex items-center justify-center transition-colors",
              isResizing ? "bg-primary/20" : "hover:bg-primary/10"
            )}
          >
            <div
              className={cn(
                "h-full w-0.5 transition-colors",
                isResizing
                  ? "bg-primary"
                  : "bg-transparent group-hover:bg-primary/50"
              )}
            />
          </div>
        )}
      </aside>

      <UploadDialog
        open={newDialogOpen}
        onOpenChange={setNewDialogOpen}
      />
    </>
  );
}
