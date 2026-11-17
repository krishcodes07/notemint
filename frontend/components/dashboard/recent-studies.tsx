"use client";

import { useAuth } from "@clerk/nextjs";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, FileText, Loader2, Sparkles } from "lucide-react";
import { DocumentResponse, getDocuments } from "@/lib/api";
import { MOCK_STUDY_DOCUMENTS } from "@/lib/mock-study-data";
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

export function RecentStudies({ onSelect, className }: RecentStudiesProps) {
  const pathname = usePathname();
  const { getToken, isSignedIn } = useAuth();

  const [documents, setDocuments] = useState<DocumentResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;

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

    window.addEventListener("notemint:documents-changed", handleDocsChanged);
    return () => {
      isCancelled = true;
      window.removeEventListener("notemint:documents-changed", handleDocsChanged);
    };
  }, [getToken, isSignedIn]);

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {/* 1. Real Uploaded Documents Section */}
      <nav className="flex flex-col gap-1" aria-label="Recent uploaded documents">
        {loading ? (
          <div className="flex items-center gap-2 px-2.5 py-3 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin text-primary" />
            <span>Loading documents...</span>
          </div>
        ) : error ? (
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-2.5 py-2 text-center text-xs text-destructive">
            <p>{error}</p>
          </div>
        ) : documents.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/80 px-2.5 py-3 text-center">
            <p className="text-xs text-muted-foreground">No documents uploaded yet.</p>
          </div>
        ) : (
          documents.map((doc) => {
            const href = `/dashboard/study/${doc.id}`;
            const isActive = pathname === href;
            const displayTitle = doc.original_filename.replace(/\.pdf$/i, "");

            return (
              <Link
                key={doc.id}
                href={href}
                onClick={onSelect}
                className={cn(
                  "group flex items-center justify-between gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-brand-soft text-brand-foreground font-semibold dark:bg-brand-soft/30 dark:text-brand-primary"
                    : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                )}
                title={doc.original_filename}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className={cn(
                      "flex size-5 shrink-0 items-center justify-center rounded transition-colors",
                      isActive
                        ? "text-primary"
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
                  <span className="truncate">{displayTitle}</span>
                </div>
                <span className="shrink-0 text-[10px] text-muted-foreground/80 opacity-0 transition-opacity group-hover:opacity-100">
                  {formatRelativeTime(doc.created_at)}
                </span>
              </Link>
            );
          })
        )}
      </nav>

      {/* 2. Sample Demo Topics Section (Phase 4 Previews) */}
      <div className="flex flex-col gap-1 border-t border-border/60 pt-3">
        <div className="flex items-center justify-between px-2 pb-1">
          <span className="text-[10px] font-bold tracking-wider uppercase text-muted-foreground/80">
            Sample Previews
          </span>
          <Sparkles className="size-2.5 text-muted-foreground/50" />
        </div>
        <nav className="flex flex-col gap-0.5" aria-label="Sample preview topics">
          {MOCK_STUDY_DOCUMENTS.map((study) => {
            const href = `/dashboard/study/${study.id}`;
            const isActive = pathname === href;

            return (
              <Link
                key={study.id}
                href={href}
                onClick={onSelect}
                className={cn(
                  "group flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
                  isActive
                    ? "bg-muted font-semibold text-foreground"
                    : "text-muted-foreground/90 hover:bg-muted/60 hover:text-foreground"
                )}
                title={`Preview: ${study.title}`}
              >
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate">{study.title}</span>
                </div>
                <span className="rounded bg-muted px-1 py-0.2 text-[9px] text-muted-foreground font-mono">
                  Demo
                </span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
