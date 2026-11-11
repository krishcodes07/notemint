"use client";

import { useState } from "react";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppSidebar } from "@/components/dashboard/app-sidebar";

export function MobileSidebar() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => setOpen(true)}
        aria-label="Open study menu"
        className="md:hidden"
      >
        <Menu className="size-5" />
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity animate-in fade-in"
            onClick={() => setOpen(false)}
          />

          {/* Drawer container */}
          <div className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col bg-sidebar shadow-2xl animate-in slide-in-from-left duration-200">
            <div className="absolute right-2 top-2 z-10">
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => setOpen(false)}
                aria-label="Close menu"
              >
                <X className="size-4" />
              </Button>
            </div>
            <AppSidebar
              className="w-full border-r-0"
              onSelectStudy={() => setOpen(false)}
            />
          </div>
        </div>
      )}
    </>
  );
}

