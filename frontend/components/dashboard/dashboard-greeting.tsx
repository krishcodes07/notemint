"use client";

import { useUser } from "@clerk/nextjs";

export function DashboardGreeting() {
  const { user, isLoaded } = useUser();

  const firstName = isLoaded
    ? user?.firstName ||
      user?.fullName?.split(" ")[0] ||
      user?.primaryEmailAddress?.emailAddress?.split("@")[0] ||
      null
    : null;

  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl md:text-5xl">
        {firstName ? (
          <>
            Hi <span className="text-primary">{firstName}</span>, Let&apos;s Study
          </>
        ) : (
          "Hi there, Let's Study"
        )}
      </h1>
      <p className="max-w-md text-sm text-muted-foreground sm:text-base">
        Select a recent topic or enter what you&apos;d like to learn today.
      </p>
    </div>
  );
}

