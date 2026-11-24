"use client";

import { useAuth } from "@clerk/nextjs";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  FileText,
  FileUp,
  Layers,
  Loader2,
  Plus,
  Sparkles,
} from "lucide-react";
import { DocumentResponse, getDocuments } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { UploadDialog, formatFileSize } from "@/components/dashboard/upload-dialog";

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
    return "Recently";
  }
}

export function DashboardDocuments() {
  const { getToken, isSignedIn } = useAuth();
  const [documents, setDocuments] = useState<DocumentResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);

  useEffect(() => {
    let isCancelled = false;
    let pollTimeout: ReturnType<typeof setTimeout> | null = null;

    async function loadDocuments() {
      if (!isSignedIn) {
        if (!isCancelled) setLoading(false);
        return;
      }

      try {
        const res = await getDocuments(getToken, { limit: 50 });
        if (!isCancelled) {
          setDocuments(res.items);
          setLoading(false);

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
      if (pollTimeout) clearTimeout(pollTimeout);
      window.removeEventListener("notemint:documents-changed", handleDocsChanged);
    };
  }, [getToken, isSignedIn]);

  return (
    <div className="w-full space-y-6">
      {/* Header bar for documents section */}
      <div className="flex items-center justify-between border-b border-border/70 pb-3">
        <div>
          <h2 className="text-lg font-bold text-foreground">Your Study Notebooks</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {documents.length > 0
              ? `${documents.length} document${documents.length === 1 ? "" : "s"} uploaded to your workspace`
              : "Upload textbooks, slides, or chapters to begin"}
          </p>
        </div>
      </div>

      {/* Content State */}
      {loading ? (
        <div className="flex h-48 w-full items-center justify-center rounded-2xl border border-border bg-card/40">
          <div className="flex flex-col items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-5 animate-spin text-primary" />
            <span>Loading your study notebooks...</span>
          </div>
        </div>
      ) : documents.length === 0 ? (
        /* Empty State */
        <div
          onClick={() => setUploadDialogOpen(true)}
          className="group cursor-pointer flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-border/80 bg-card/40 p-8 sm:p-12 text-center transition-all hover:border-primary/50 hover:bg-card/70"
        >
          <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary transition-transform group-hover:scale-105 mb-4">
            <FileUp className="size-7 stroke-[2]" />
          </div>

          <h3 className="text-lg font-bold text-foreground">
            No study documents yet
          </h3>
          <p className="mt-1.5 max-w-md text-sm text-muted-foreground leading-relaxed">
            Drag and drop any chapter PDF, lecture slides, or textbook here. NoteMint will automatically extract formulas, key terms, flashcards, and exam questions.
          </p>

          <Button
            type="button"
            className="mt-6 rounded-full bg-foreground text-background px-6 h-10 text-xs font-semibold hover:bg-foreground/90 shadow-sm gap-2"
          >
            <Plus className="size-3.5" />
            <span>Upload your first PDF</span>
          </Button>

          <span className="text-[11px] text-muted-foreground mt-3">
            Supports PDF files up to 20 MB · Stored in private encrypted storage
          </span>
        </div>
      ) : (
        /* Documents Grid */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {documents.map((doc) => {
            const rawPdfName = doc.original_filename.replace(/\.pdf$/i, "");
            const isAiNamed = Boolean(
              doc.title &&
                doc.title.trim().length > 0 &&
                doc.title.trim().toLowerCase() !== "smart study notes" &&
                doc.title.trim().toLowerCase() !== "chapter summary" &&
                doc.title.trim().toLowerCase() !== "practice quiz" &&
                doc.title.trim().toLowerCase() !== "study flashcards" &&
                doc.title.trim().toLowerCase() !== "important questions & answers" &&
                doc.title.trim() !== rawPdfName
            );
            const rawDisplayTitle = isAiNamed ? doc.title!.trim() : rawPdfName;
            const displayTitle = rawDisplayTitle.replace(/(\s*\|\s*NoteMint)+/gi, "").trim();
            const href = `/dashboard/study/${doc.id}`;

            return (
              <Link
                key={doc.id}
                href={href}
                className="group relative flex flex-col justify-between rounded-2xl border border-border bg-card p-5 shadow-xs transition-all hover:border-primary/60 hover:shadow-md"
              >
                <div className="space-y-3">
                  {/* Top row */}
                  <div className="flex items-center justify-between">
                    <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary transition-transform group-hover:scale-105">
                      <FileText className="size-5" />
                    </div>

                    {(doc.status === "extracting" || doc.status === "generating") && (
                      <span className="rounded-full bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300 flex items-center gap-1">
                        <Loader2 className="size-3 animate-spin" />
                        <span>Processing...</span>
                      </span>
                    )}

                    {doc.status === "failed" && (
                      <span className="rounded-full bg-rose-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-rose-700 dark:text-rose-300">
                        Failed
                      </span>
                    )}
                  </div>

                  {/* Title & file details */}
                  <div>
                    <h3 className="font-bold text-foreground text-sm sm:text-base leading-snug line-clamp-2 group-hover:text-primary transition-colors">
                      {displayTitle}
                    </h3>
                    {isAiNamed && (
                      <span className="text-[11px] text-muted-foreground font-mono block truncate mt-0.5">
                        {doc.original_filename}
                      </span>
                    )}
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1.5">
                      <span>{formatFileSize(doc.file_size_bytes)}</span>
                      {doc.page_count && (
                        <>
                          <span>•</span>
                          <span>{doc.page_count} pages</span>
                        </>
                      )}
                      <span>•</span>
                      <span>{formatRelativeTime(doc.created_at)}</span>
                    </div>
                  </div>
                </div>

                {/* Bottom tool shortcuts */}
                <div className="mt-5 pt-3 border-t border-border/60 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium">Notes</span>
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium">Cards</span>
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium">Quiz</span>
                  </div>

                  <span className="inline-flex items-center gap-1 font-semibold text-primary group-hover:translate-x-0.5 transition-transform">
                    <span>Study</span>
                    <ArrowRight className="size-3" />
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Upload Dialog */}
      <UploadDialog
        open={uploadDialogOpen}
        onOpenChange={setUploadDialogOpen}
      />
    </div>
  );
}

