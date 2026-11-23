"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { NoteMintLogo } from "@/components/brand/logo";
import { MobileSidebar } from "@/components/dashboard/mobile-sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { UploadDialog } from "@/components/dashboard/upload-dialog";

interface DashboardHeaderProps {
  title?: string;
  subtitle?: string;
}

export function DashboardHeader({ title }: DashboardHeaderProps) {
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);

  return (
    <>
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
          <Button
            size="sm"
            onClick={() => setUploadDialogOpen(true)}
            className="hidden sm:inline-flex rounded-full bg-foreground text-background text-xs font-semibold px-3.5 h-8 gap-1.5 shadow-xs hover:bg-foreground/90 transition-all"
          >
            <Plus className="size-3" />
            <span>Upload PDF</span>
          </Button>

          <div className="h-4 w-px bg-border hidden sm:block" aria-hidden />

          <ThemeToggle />
        </div>
      </header>

      <UploadDialog
        open={uploadDialogOpen}
        onOpenChange={setUploadDialogOpen}
      />
    </>
  );
}
