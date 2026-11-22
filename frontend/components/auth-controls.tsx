import { Show, UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";

/**
 * Authentication-aware navigation controls.
 *
 * Uses Clerk's server <Show> component (reads the request session), so it
 * must sit behind a Suspense boundary when Cache Components is enabled.
 */
export function AuthControls() {
  return (
    <Suspense
      fallback={
        <span
          className="h-8 w-24 animate-pulse rounded-full bg-muted"
          aria-hidden
        />
      }
    >
      <Show when="signed-out">
        <div className="flex items-center gap-3">
          <Link
            href="/sign-in"
            className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Log in
          </Link>
          <Button
            size="sm"
            asChild
            className="h-9 rounded-full bg-foreground px-4 text-xs font-semibold text-background hover:bg-foreground/90 transition-all shadow-xs"
          >
            <Link href="/sign-up">Join for free</Link>
          </Button>
        </div>
      </Show>
      <Show when="signed-in">
        <div className="flex items-center gap-3">
          <Button
            size="sm"
            asChild
            variant="outline"
            className="h-8 rounded-full px-3 text-xs font-medium"
          >
            <Link href="/dashboard">Dashboard</Link>
          </Button>
          <UserButton />
        </div>
      </Show>
    </Suspense>
  );
}
