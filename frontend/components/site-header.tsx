import { Leaf } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-sm">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-2.5">
          <span
            className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground"
            aria-hidden
          >
            <Leaf className="size-4" />
          </span>
          <span className="text-base font-semibold tracking-tight">
            NoteMint
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-xs font-medium text-muted-foreground sm:inline">
            Phase 1 · Foundation
          </span>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
