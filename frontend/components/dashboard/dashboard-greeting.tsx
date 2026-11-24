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
    <div className="flex flex-col items-center gap-1.5 sm:gap-2 text-center max-w-xl mx-auto px-1">
      <h1 className="text-2xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-foreground leading-tight">
        {firstName ? `Welcome back, ${firstName}.` : "Welcome to your study studio."}
      </h1>
      <p className="text-xs sm:text-base text-muted-foreground leading-relaxed">
        Upload a chapter PDF or continue with your study notebooks below.
      </p>
    </div>
  );
}
