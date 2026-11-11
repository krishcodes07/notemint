import { Leaf, Sparkles } from "lucide-react";
import Link from "next/link";
import { AuthControls } from "@/components/auth-controls";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2.5 transition-opacity hover:opacity-85">
            <span
              className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-xs"
              aria-hidden
            >
              <Leaf className="size-4" />
            </span>
            <span className="text-base font-bold tracking-tight text-foreground">
              NoteMint
            </span>
          </Link>

          <nav className="hidden items-center gap-5 text-xs font-medium text-muted-foreground sm:flex">
            <Link
              href="/dashboard"
              className="transition-colors hover:text-foreground"
            >
              Dashboard
            </Link>
            <Link
              href="/dashboard/study/life-processes"
              className="transition-colors hover:text-foreground"
            >
              Workspace Preview
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <Badge
            variant="outline"
            className="hidden items-center gap-1 border-primary/20 bg-brand-soft/30 px-2 py-0.5 text-[11px] font-medium text-primary sm:inline-flex"
          >
            <Sparkles className="size-3" />
            <span>Phase 4 Active</span>
          </Badge>
          <AuthControls />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
