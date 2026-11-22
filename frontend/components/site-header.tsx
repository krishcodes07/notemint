import Link from "next/link";
import { AuthControls } from "@/components/auth-controls";
import { NoteMintLogo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/60 bg-background/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-10">
          <NoteMintLogo size="md" />

          <nav className="hidden items-center gap-7 text-sm font-medium text-muted-foreground md:flex">
            <Link
              href="#preview"
              className="transition-colors hover:text-foreground"
            >
              Study Studio
            </Link>
            <Link
              href="#workflow"
              className="transition-colors hover:text-foreground"
            >
              How it works
            </Link>
            <Link
              href="#comparison"
              className="transition-colors hover:text-foreground"
            >
              Why NoteMint
            </Link>
            <Link
              href="/dashboard/study/life-processes"
              className="transition-colors hover:text-foreground"
            >
              Interactive Demo
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-4">
          <AuthControls />
          <div className="h-4 w-px bg-border/80" aria-hidden />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
