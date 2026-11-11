"use client";

import { useAuth, useClerk, useUser } from "@clerk/nextjs";
import { useEffect, useState } from "react";
import {
  ChevronsUpDown,
  Database,
  LogOut,
  Moon,
  Sparkles,
  Sun,
  User as UserIcon,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getUserProfile, UserProfileResponse } from "@/lib/api";

export function SidebarUser() {
  const { user, isLoaded } = useUser();
  const { signOut } = useClerk();
  const { getToken } = useAuth();
  const [backendProfile, setBackendProfile] =
    useState<UserProfileResponse | null>(null);
  const [backendStatus, setBackendStatus] = useState<
    "idle" | "loading" | "connected" | "error"
  >("idle");

  // Fetch backend profile from GET /api/v1/users/me
  useEffect(() => {
    let isCancelled = false;

    async function loadBackendProfile() {
      try {
        setBackendStatus("loading");
        const profile = await getUserProfile(getToken);
        if (!isCancelled) {
          setBackendProfile(profile);
          setBackendStatus("connected");
        }
      } catch {
        if (!isCancelled) {
          setBackendStatus("error");
        }
      }
    }

    if (isLoaded && user) {
      loadBackendProfile();
    }

    return () => {
      isCancelled = true;
    };
  }, [isLoaded, user, getToken]);

  const displayName =
    backendProfile?.display_name ||
    user?.fullName ||
    user?.firstName ||
    user?.primaryEmailAddress?.emailAddress?.split("@")[0] ||
    "Student";

  const email =
    backendProfile?.email ||
    user?.primaryEmailAddress?.emailAddress ||
    "Signed in";

  const toggleTheme = () => {
    const isDark = document.documentElement.classList.contains("dark");
    const nextTheme = isDark ? "light" : "dark";
    window.localStorage.setItem("theme", nextTheme);
    document.documentElement.classList.toggle("dark", nextTheme === "dark");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="group flex w-full items-center justify-between gap-2.5 rounded-xl border border-transparent p-1.5 text-left transition-colors hover:bg-muted/80 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="relative flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-muted text-xs font-semibold text-foreground">
            {user?.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.imageUrl}
                alt={displayName}
                className="size-full object-cover"
              />
            ) : (
              <span>{displayName.slice(0, 2).toUpperCase()}</span>
            )}
            <span
              className={`absolute bottom-0 right-0 size-2 rounded-full border border-background ${
                backendStatus === "connected"
                  ? "bg-emerald-500"
                  : backendStatus === "error"
                  ? "bg-amber-500"
                  : "bg-muted-foreground"
              }`}
              title={
                backendStatus === "connected"
                  ? "Backend profile synced (Neon DB)"
                  : "Offline / local session"
              }
            />
          </div>
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-xs font-semibold text-foreground">
              {displayName}
            </span>
            <span className="truncate text-[10px] text-muted-foreground">
              {email}
            </span>
          </div>
        </div>
        <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground group-hover:text-foreground" />
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="start"
        side="top"
        className="w-56 p-1.5 shadow-lg"
      >
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="text-xs font-medium text-foreground">
            {displayName}
          </span>
          <span className="text-[10px] text-muted-foreground truncate">
            {email}
          </span>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        <div className="px-2.5 py-1.5 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-1.5 font-medium">
            <Database className="size-3 text-primary" />
            <span>Database Sync</span>
          </div>
          <p className="mt-0.5 text-[10px] text-muted-foreground/80">
            {backendStatus === "connected"
              ? "Synced via Neon PostgreSQL"
              : backendStatus === "loading"
              ? "Syncing profile..."
              : "Backend offline (session active)"}
          </p>
        </div>

        <DropdownMenuSeparator />

        <DropdownMenuItem onClick={toggleTheme}>
          <Sun className="size-4 dark:hidden" />
          <Moon className="hidden size-4 dark:inline" />
          <span>Toggle theme</span>
        </DropdownMenuItem>

        <DropdownMenuItem
          onClick={() => {
            alert(
              "NoteMint Study Settings: Account configuration and study preferences will be customizable in an upcoming phase."
            );
          }}
        >
          <UserIcon className="size-4" />
          <span>Study Preferences</span>
        </DropdownMenuItem>

        <DropdownMenuItem
          onClick={() => {
            alert("NoteMint AI: Models powered by Kilo Gateway (Phase 7+).");
          }}
        >
          <Sparkles className="size-4" />
          <span>AI Engine status</span>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          className="text-destructive focus:bg-destructive/10 focus:text-destructive"
          onClick={() => signOut({ redirectUrl: "/" })}
        >
          <LogOut className="size-4" />
          <span>Sign out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

