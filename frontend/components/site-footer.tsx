import { Leaf } from "lucide-react";
import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-border/70 bg-background/50">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-xs text-muted-foreground sm:flex-row sm:px-6">
        <div className="flex items-center gap-2 font-medium text-foreground">
          <span className="flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Leaf className="size-3" />
          </span>
          <span className="font-bold tracking-tight">NoteMint</span>
          <span className="text-muted-foreground font-normal">
            — AI-Powered Personalized Learning
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-4">
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
            Study Workspace
          </Link>
          <Link
            href="/sign-in"
            className="transition-colors hover:text-foreground"
          >
            Sign In
          </Link>
          <span className="text-border">|</span>
          <span className="font-mono text-[11px]">Phase 4 Live</span>
        </div>
      </div>
    </footer>
  );
}
