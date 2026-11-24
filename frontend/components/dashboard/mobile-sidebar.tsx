"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppSidebar } from "@/components/dashboard/app-sidebar";

export function MobileSidebar() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Close drawer on Escape key press
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  // Lock body scroll when drawer is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const drawerContent =
    open && mounted ? (
      createPortal(
        <div className="fixed inset-0 z-[100] md:hidden">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity animate-in fade-in"
            onClick={() => setOpen(false)}
          />

          {/* Drawer container */}
          <div className="fixed inset-y-0 left-0 z-[100] flex w-72 max-w-[85vw] flex-col bg-sidebar shadow-2xl animate-in slide-in-from-left duration-200 pt-safe pb-safe">
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
        </div>,
        document.body
      )
    ) : null;

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

      {drawerContent}
    </>
  );
}

