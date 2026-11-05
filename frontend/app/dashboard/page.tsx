import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthConnectivity } from "@/components/auth-connectivity";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata = {
  title: "Dashboard",
};

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="h-8 w-48 animate-pulse rounded-md bg-muted" />
      <div className="h-24 w-full animate-pulse rounded-xl bg-muted" />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="h-40 animate-pulse rounded-xl bg-muted" />
        <div className="h-40 animate-pulse rounded-xl bg-muted" />
      </div>
    </div>
  );
}

/**
 * Protected dashboard. Verifies the session close to the resource
 * (in addition to proxy.ts) — Cache Components requires the auth()
 * read to sit behind a Suspense boundary.
 */
async function DashboardGuard() {
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Badge variant="secondary" className="w-fit">
          Phase 2 · Authentication test screen
        </Badge>
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome to NoteMint
        </h1>
        <p className="text-muted-foreground">
          You&apos;re signed in. This dashboard confirms your session on both
          the frontend and the backend.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Frontend session</CardTitle>
            <CardDescription>
              Clerk session on the Next.js application.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="flex flex-col gap-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Session user ID</dt>
                <dd>
                  <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs">
                    {userId}
                  </code>
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Status</dt>
                <dd className="font-medium text-brand-secondary">Signed in</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <AuthConnectivity />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
          <Suspense fallback={<DashboardSkeleton />}>
            <DashboardGuard />
          </Suspense>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
