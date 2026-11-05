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
          className="h-8 w-24 animate-pulse rounded-md bg-muted"
          aria-hidden
        />
      }
    >
      <Show when="signed-out">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/sign-in">Sign in</Link>
          </Button>
          <Button size="sm" asChild>
            <Link href="/sign-up">Get started</Link>
          </Button>
        </div>
      </Show>
      <Show when="signed-in">
        <UserButton />
      </Show>
    </Suspense>
  );
}
