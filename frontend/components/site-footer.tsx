import Link from "next/link";
import { NoteMintLogo } from "@/components/brand/logo";

export function SiteFooter() {
  return (
    <footer className="border-t border-border/70 bg-muted/20">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:py-16">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-5">
          {/* Brand Column */}
          <div className="space-y-4 md:col-span-2">
            <NoteMintLogo size="md" />
            <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
              The modern study workspace for students. Turn textbooks and
              lecture slides into active recall flashcards, practice questions,
              and quizzes.
            </p>
            <div className="text-xs text-muted-foreground">
              Built for focused revision and exam preparation.
            </div>
          </div>

          {/* Product Links */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-foreground">
              Workspace
            </h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link
                  href="/dashboard/study/life-processes"
                  className="transition-colors hover:text-foreground"
                >
                  Interactive Demo
                </Link>
              </li>
              <li>
                <Link
                  href="/dashboard"
                  className="transition-colors hover:text-foreground"
                >
                  Dashboard
                </Link>
              </li>
              <li>
                <Link
                  href="#preview"
                  className="transition-colors hover:text-foreground"
                >
                  Studio Preview
                </Link>
              </li>
              <li>
                <Link
                  href="/sign-up"
                  className="transition-colors hover:text-foreground"
                >
                  Join for free
                </Link>
              </li>
            </ul>
          </div>

          {/* Study Tools */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-foreground">
              Study Tools
            </h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <span className="text-foreground/90">Smart Note Distillation</span>
              </li>
              <li>
                <span className="text-foreground/90">Two-Sided Flashcards</span>
              </li>
              <li>
                <span className="text-foreground/90">Marking Scheme Questions</span>
              </li>
              <li>
                <span className="text-foreground/90">Bilingual AI Mentor</span>
              </li>
            </ul>
          </div>

          {/* Access */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-foreground">
              Access
            </h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link
                  href="/sign-in"
                  className="transition-colors hover:text-foreground"
                >
                  Log in
                </Link>
              </li>
              <li>
                <Link
                  href="/sign-up"
                  className="transition-colors hover:text-foreground"
                >
                  Create free account
                </Link>
              </li>
              <li>
                <span className="text-xs text-muted-foreground">
                  All systems operational
                </span>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-border/60 pt-8 text-xs text-muted-foreground sm:flex-row">
          <p>© 2026 NoteMint. All rights reserved.</p>
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="hover:text-foreground transition-colors">
              Enter Workspace
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
