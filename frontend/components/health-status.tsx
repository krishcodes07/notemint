"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Server,
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
  apiConfig,
  getHealth,
  type HealthResponse,
} from "@/lib/api";

type StatusState =
  | { kind: "loading" }
  | { kind: "success"; data: HealthResponse }
  | { kind: "error"; message: string };

function toErrorMessage(error: unknown): string {
  if (error instanceof BackendUnavailableError || error instanceof ApiError) {
    return error.message;
  }
  return "Unexpected error while contacting the API.";
}

/** Fetch health status and return the resulting state (no React state involved). */
async function requestHealth(): Promise<StatusState> {
  try {
    const data = await getHealth();
    return { kind: "success", data };
  } catch (error) {
    return { kind: "error", message: toErrorMessage(error) };
  }
}

export function HealthStatus() {
  const [state, setState] = useState<StatusState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    void requestHealth().then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function recheck() {
    setState({ kind: "loading" });
    void requestHealth().then((next) => setState(next));
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2">
            <Server className="size-4 text-primary" aria-hidden />
            <CardTitle className="text-base">System status</CardTitle>
          </div>
          {state.kind === "success" && (
            <Badge variant="secondary">Connected</Badge>
          )}
        </div>
        <CardDescription>
          Live check of the NoteMint API from the frontend.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center gap-3 text-sm">
          {state.kind === "loading" && (
            <>
              <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />
              <span className="text-muted-foreground">
                Contacting the API…
              </span>
            </>
          )}
          {state.kind === "success" && (
            <>
              <CheckCircle2
                className="size-4 text-brand-secondary"
                aria-hidden
              />
              <span>
                <span className="font-medium">{state.data.service}</span>{" "}
                <span className="text-muted-foreground">
                  is {state.data.status}
                </span>
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
            GET {apiConfig.baseUrl}/api/v1/health
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
