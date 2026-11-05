"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ApiError,
  BackendUnavailableError,
  UnauthorizedError,
  apiConfig,
  getMe,
  type MeResponse,
} from "@/lib/api";

type StatusState =
  | { kind: "loading" }
  | { kind: "success"; data: MeResponse }
  | { kind: "error"; message: string };

function toErrorMessage(error: unknown): string {
  if (
    error instanceof UnauthorizedError ||
    error instanceof BackendUnavailableError ||
    error instanceof ApiError
  ) {
    return error.message;
  }
  return "Unexpected error while contacting the API.";
}

/** Fetch the verified identity and return the resulting state (no React state involved). */
async function requestMe(
  getToken: () => Promise<string | null>,
  isSignedIn: boolean | undefined,
): Promise<StatusState> {
  if (!isSignedIn) {
    return {
      kind: "error",
      message: "Not signed in. Sign in to verify your identity with the API.",
    };
  }
  try {
    const data = await getMe(getToken);
    return { kind: "success", data };
  } catch (error) {
    return { kind: "error", message: toErrorMessage(error) };
  }
}

/**
 * Authenticated connectivity test: calls GET /api/v1/auth/me with the
 * current Clerk session token and displays the backend-verified user id.
 */
export function AuthConnectivity() {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const [state, setState] = useState<StatusState>({ kind: "loading" });

  useEffect(() => {
    if (!isLoaded) return;
    let cancelled = false;
    void requestMe(getToken, isSignedIn).then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, getToken]);

  function recheck() {
    setState({ kind: "loading" });
    void requestMe(getToken, isSignedIn).then((next) => setState(next));
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-primary" aria-hidden />
            <CardTitle className="text-base">Backend identity</CardTitle>
          </div>
          {state.kind === "success" && (
            <Badge variant="secondary">Verified</Badge>
          )}
        </div>
        <CardDescription>
          Session token verified independently by the FastAPI backend.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center gap-3 text-sm">
          {state.kind === "loading" && (
            <>
              <Loader2
                className="size-4 animate-spin text-muted-foreground"
                aria-hidden
              />
              <span className="text-muted-foreground">
                Verifying session with the API…
              </span>
            </>
          )}
          {state.kind === "success" && (
            <>
              <CheckCircle2
                className="size-4 text-brand-secondary"
                aria-hidden
              />
              <span className="min-w-0">
                <span className="text-muted-foreground">Verified user ID: </span>
                <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs">
                  {state.data.user_id}
                </code>
              </span>
            </>
          )}
          {state.kind === "error" && (
            <>
              <AlertCircle className="size-4 text-destructive" aria-hidden />
              <span className="text-muted-foreground">{state.message}</span>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <code className="rounded-md bg-muted px-2 py-1 font-mono text-xs text-muted-foreground">
            GET {apiConfig.baseUrl}/api/v1/auth/me
          </code>
          <Button
            variant="outline"
            size="sm"
            onClick={recheck}
            disabled={state.kind === "loading"}
          >
            <RefreshCw className="size-3.5" aria-hidden />
            Re-check
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
