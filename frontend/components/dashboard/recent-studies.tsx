"use client";

import { useAuth } from "@clerk/nextjs";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, FileText, Loader2 } from "lucide-react";
import { DocumentResponse, getDocuments } from "@/lib/api";
import { cn } from "@/lib/utils";

interface RecentStudiesProps {
  onSelect?: () => void;
  className?: string;
}

function formatRelativeTime(dateString: string): string {
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "Recent";
  }
}

function StatusIndicator({ status }: { status: DocumentResponse["status"] }) {
  if (status === "extracting" || status === "generating") {
    return (
      <span className="flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
        <Loader2 className="size-2.5 animate-spin" />
        <span>Processing</span>
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold text-destructive">
        <span>Failed</span>
      </span>
    );
  }
  return null;
}

export function RecentStudies({ onSelect, className }: RecentStudiesProps) {
  const pathname = usePathname();
  const { getToken, isSignedIn } = useAuth();

  const [documents, setDocuments] = useState<DocumentResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;
    let pollTimeout: ReturnType<typeof setTimeout> | null = null;

    async function loadDocuments() {
      if (!isSignedIn) {
        if (!isCancelled) setLoading(false);
        return;
      }

      try {
        const res = await getDocuments(getToken, { limit: 20 });
        if (!isCancelled) {
          setDocuments(res.items);
          setLoading(false);

          // Auto-refresh while any document is in progress
          const hasPending = res.items.some(
            (d) =>
              d.status === "uploaded" ||
              d.status === "extracting" ||
              d.status === "generating"
          );
          if (hasPending) {
            pollTimeout = setTimeout(loadDocuments, 4000);
          }
        }
      } catch {
        if (!isCancelled) {
          setError("Unable to load documents");
          setLoading(false);
        }
      }
    }

    loadDocuments();

    const handleDocsChanged = () => {
      loadDocuments();
    };

    const handleDocRenamed = (e: Event) => {
      const ce = e as CustomEvent<{ id: string; title: string }>;
      if (ce.detail?.id && ce.detail?.title) {
        setDocuments((prev) =>
          prev.map((d) =>
            d.id === ce.detail.id ? { ...d, title: ce.detail.title } : d
          )
        );
      }
    };

    window.addEventListener("notemint:documents-changed", handleDocsChanged);
    window.addEventListener("notemint:document-renamed", handleDocRenamed);
    return () => {
      isCancelled = true;
      if (pollTimeout) clearTimeout(pollTimeout);
      window.removeEventListener("notemint:documents-changed", handleDocsChanged);
      window.removeEventListener("notemint:document-renamed", handleDocRenamed);
    };
  }, [getToken, isSignedIn]);

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <nav className="flex flex-col gap-1" aria-label="Your study documents">
        {loading ? (
          <div className="flex items-center gap-2 px-2.5 py-3 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin text-primary" />
            <span>Loading documents...</span>
          </div>
        ) : error ? (
          <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2 text-center text-xs text-destructive">
            <p>{error}</p>
          </div>
        ) : documents.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/80 px-3 py-4 text-center">
            <p className="text-xs font-medium text-muted-foreground">
              No documents yet.
            </p>
            <p className="text-[11px] text-muted-foreground/80 mt-0.5">
              Upload a PDF to get started.
            </p>
          </div>
        ) : (
          documents.map((doc) => {
            const href = `/dashboard/study/${doc.id}`;
            const isActive = pathname === href;
            const displayTitle = doc.title || doc.original_filename.replace(/\.pdf$/i, "");

            return (
              <Link
                key={doc.id}
                href={href}
                onClick={onSelect}
                className={cn(
                  "group flex items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-xs font-semibold transition-all duration-300",
                  isActive
                    ? "bg-foreground text-background shadow-xs font-bold"
                    : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                )}
                title={doc.title ? `${doc.title} (${doc.original_filename})` : doc.original_filename}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className={cn(
                      "flex size-4 shrink-0 items-center justify-center transition-colors",
                      isActive
                        ? "text-background"
                        : "text-muted-foreground group-hover:text-foreground"
                    )}
                    aria-hidden
                  >
                    {isActive ? (
                      <BookOpen className="size-3.5" />
                    ) : (
                      <FileText className="size-3.5" />
                    )}
                  </span>
                  <span
                    key={displayTitle}
                    className="truncate animate-in fade-in slide-in-from-left-0.5 duration-300"
                  >
                    {displayTitle}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <StatusIndicator status={doc.status} />
                  <span className="hidden text-[10px] text-muted-foreground transition-opacity group-hover:inline">
                    {formatRelativeTime(doc.created_at)}
                  </span>
                </div>
              </Link>
            );
          })
        )}
      </nav>
    </div>
  );
}
