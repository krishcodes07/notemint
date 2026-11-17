"use client";

import { useAuth } from "@clerk/nextjs";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Calendar,
  CheckCircle2,
  ExternalLink,
  Eye,
  FileCheck2,
  FileText,
  HardDrive,
  HelpCircle,
  Layers,
  Loader2,
  Lock,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { WorkspaceHeader } from "@/components/dashboard/workspace-header";
import {
  WorkspaceNavigation,
  WorkspaceTab,
} from "@/components/dashboard/workspace-navigation";
import { WorkspaceEmptyState } from "@/components/dashboard/workspace-empty-state";
import { DocumentResponse, deleteDocument, getDocumentFileBlob } from "@/lib/api";
import { formatFileSize } from "@/components/dashboard/upload-dialog";

interface UploadedStudyWorkspaceProps {
  document: DocumentResponse;
}

export function UploadedStudyWorkspace({
  document,
}: UploadedStudyWorkspaceProps) {
  const router = useRouter();
  const { getToken } = useAuth();

  const [activeTab, setActiveTab] = useState<WorkspaceTab>("notes");
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [viewingPdf, setViewingPdf] = useState(false);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const displayTitle = document.original_filename.replace(/\.pdf$/i, "");
  const formattedDate = new Date(document.created_at).toLocaleDateString(
    undefined,
    {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }
  );

  const handleOpenPdf = async () => {
    try {
      setLoadingPdf(true);
      setPdfError(null);

      // If already cached blob url, reuse or recreate
      let url = pdfBlobUrl;
      if (!url) {
        const blob = await getDocumentFileBlob(document.id, getToken);
        url = URL.createObjectURL(blob);
        setPdfBlobUrl(url);
      }
      setViewingPdf(true);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to load document PDF";
      setPdfError(msg);
    } finally {
      setLoadingPdf(false);
    }
  };

  const handleOpenInNewTab = async () => {
    try {
      setLoadingPdf(true);
      const blob = await getDocumentFileBlob(document.id, getToken);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
    } catch {
      alert("Failed to open PDF in new tab");
    } finally {
      setLoadingPdf(false);
    }
  };

  const handleDelete = async () => {
    try {
      setIsDeleting(true);
      await deleteDocument(document.id, getToken);

      // Notify other components of document change
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("notemint:documents-changed"));
      }

      setDeleteDialogOpen(false);
      router.push("/dashboard");
    } catch {
      alert("Failed to delete document. Please try again.");
      setIsDeleting(false);
    }
  };

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-background">
      {/* Workspace top header */}
      <WorkspaceHeader
        title={displayTitle}
        subject="PDF Document"
        classLevel="Uploaded"
      />

      {/* Main Content Body */}
      <main className="flex-1 overflow-y-auto px-4 md:px-8">
        {activeTab === "notes" && (
          <article className="mx-auto w-full max-w-3xl pb-28 pt-6 text-foreground">
            {/* Header Document Summary */}
            <div className="mb-6 flex flex-col gap-4 rounded-2xl border bg-card/60 p-6 shadow-xs">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-start gap-3.5">
                  <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-brand-soft text-primary">
                    <FileText className="size-6" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="truncate text-lg font-bold tracking-tight text-foreground sm:text-xl">
                      {document.original_filename}
                    </h2>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <HardDrive className="size-3.5" />
                        <span>{formatFileSize(document.file_size_bytes)}</span>
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Calendar className="size-3.5" />
                        <span>{formattedDate}</span>
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1 text-primary">
                        <Lock className="size-3" />
                        <span>Private Storage</span>
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-start">
                  <Badge className="bg-brand-soft font-semibold text-primary capitalize hover:bg-brand-soft">
                    {document.status}
                  </Badge>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="mt-2 flex flex-wrap items-center gap-2.5 border-t pt-4">
                <Button
                  size="sm"
                  onClick={handleOpenPdf}
                  disabled={loadingPdf}
                  className="gap-1.5"
                >
                  {loadingPdf ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Eye className="size-3.5" />
                  )}
                  <span>View Original PDF</span>
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleOpenInNewTab}
                  disabled={loadingPdf}
                  className="gap-1.5"
                >
                  <ExternalLink className="size-3.5" />
                  <span>Open in Tab</span>
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDeleteDialogOpen(true)}
                  className="ml-auto gap-1 text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="size-3.5" />
                  <span>Delete</span>
                </Button>
              </div>

              {pdfError && (
                <p className="mt-1 text-xs text-destructive">{pdfError}</p>
              )}
            </div>

            {/* Phase 5/6/7 Pipeline Roadmap Card */}
            <div className="flex flex-col gap-4 rounded-2xl border bg-muted/30 p-6">
              <div className="flex items-center gap-2.5 text-xs font-bold uppercase tracking-wider text-primary">
                <FileCheck2 className="size-4" />
                <span>Document Ingestion Status</span>
              </div>

              <div className="flex flex-col gap-3 text-sm leading-relaxed text-muted-foreground">
                <div className="flex items-start gap-3 rounded-xl border border-primary/20 bg-brand-soft/20 p-4 text-xs">
                  <CheckCircle2 className="size-4 shrink-0 text-primary translate-y-0.5" />
                  <div>
                    <p className="font-semibold text-foreground">
                      Phase 5 Complete: PDF Secured in Private Storage
                    </p>
                    <p className="mt-0.5 text-muted-foreground">
                      Your document has been verified (%PDF- header and integrity
                      checked) and encrypted in private Neon Object Storage. Ownership
                      is tied to your authenticated Clerk user profile.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 rounded-xl border bg-card/60 p-4 text-xs">
                  <div className="flex size-4 shrink-0 items-center justify-center rounded-full border border-primary font-mono text-[10px] font-bold text-primary">
                    6
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">
                      Upcoming Phase 6: PDF Extraction Engine
                    </p>
                    <p className="mt-0.5 text-muted-foreground">
                      The extraction engine will parse this PDF to extract text,
                      identify headings, section divisions, tables, and concept diagrams.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 rounded-xl border bg-card/60 p-4 text-xs">
                  <div className="flex size-4 shrink-0 items-center justify-center rounded-full border border-muted-foreground/60 font-mono text-[10px] font-bold text-muted-foreground">
                    7
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">
                      Upcoming Phase 7: AI Generation Engine
                    </p>
                    <p className="mt-0.5 text-muted-foreground">
                      AI models will generate smart summary notes, CBSE/exam questions
                      with model answers, active-recall flashcards, and diagnostic MCQ
                      quizzes based strictly on this document.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </article>
        )}

        {activeTab === "questions" && (
          <div className="pb-28 pt-6">
            <WorkspaceEmptyState
              icon={HelpCircle}
              title="Important Questions"
              phaseBadge="Phase 7 · AI Generation Engine"
              description={`Exam-oriented questions and marking schemes for "${document.original_filename}" will be synthesized once Phase 6 extracts the text.`}
              features={[
                "Aligned directly with syllabus and chapter structure",
                "1-mark, 3-mark, and 5-mark difficulty breakdown",
                "Source citations linking back to original PDF pages",
              ]}
              onAction={() => setActiveTab("notes")}
              actionLabel="Back to Document Info"
            />
          </div>
        )}

        {activeTab === "flashcards" && (
          <div className="pb-28 pt-6">
            <WorkspaceEmptyState
              icon={Layers}
              title="Active Recall Flashcards"
              phaseBadge="Phase 7 · Memory Optimization"
              description={`Spaced-repetition flashcards for "${document.original_filename}" will be generated automatically in Phase 7.`}
              features={[
                "Two-sided memory cards with instant flip feedback",
                "Equations, definitions, and key concept retention",
                "Confidence rating to optimize daily review queues",
              ]}
              onAction={() => setActiveTab("notes")}
              actionLabel="Back to Document Info"
            />
          </div>
        )}

        {activeTab === "quiz" && (
          <div className="pb-28 pt-6">
            <WorkspaceEmptyState
              icon={CheckCircle2}
              title="Diagnostic MCQ Quizzes"
              phaseBadge="Phase 7 · Adaptive Testing"
              description={`Self-assessment quizzes tailored to "${document.original_filename}" will arrive in Phase 7.`}
              features={[
                "Multiple-choice practice questions with detailed explanations",
                "Weak-area diagnostics indicating topics needing re-reading",
                "Board exam pattern simulation",
              ]}
              onAction={() => setActiveTab("notes")}
              actionLabel="Back to Document Info"
            />
          </div>
        )}

        {activeTab === "ai-talk" && (
          <div className="pb-28 pt-6">
            <WorkspaceEmptyState
              icon={Sparkles}
              title="Bilingual AI Teacher"
              phaseBadge="Phase 9 · Grounded Tutor"
              description={`Your interactive Socratic tutor will be grounded directly in "${document.original_filename}". You will be able to ask questions in English or Hindi.`}
              features={[
                "Zero hallucinations: answers strictly grounded in this PDF",
                "Bilingual explanations in English, Hindi, and Hinglish",
                "Voice tutor capability planned for Phase 10",
              ]}
              onAction={() => setActiveTab("notes")}
              actionLabel="Back to Document Info"
            />
          </div>
        )}
      </main>

      {/* Floating Bottom Navigation matching hand-drawn sketch */}
      <WorkspaceNavigation
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      {/* Embedded PDF Viewer Modal */}
      <Dialog open={viewingPdf} onOpenChange={setViewingPdf}>
        <DialogContent className="max-w-4xl h-[85vh] flex flex-col p-4">
          <DialogHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <DialogTitle className="text-base font-bold text-foreground">
                {document.original_filename}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Original study material loaded securely from private storage
              </DialogDescription>
            </div>
          </DialogHeader>

          <div className="flex-1 w-full rounded-xl overflow-hidden border bg-muted/40">
            {pdfBlobUrl ? (
              <iframe
                src={`${pdfBlobUrl}#toolbar=1`}
                className="w-full h-full border-none"
                title={document.original_filename}
              />
            ) : (
              <div className="flex h-full items-center justify-center">
                <Loader2 className="size-6 animate-spin text-primary" />
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive">Delete Document</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &ldquo;{document.original_filename}&rdquo;?
              This will permanently delete the file from private storage and remove
              all associated workspace data. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDelete}
              disabled={isDeleting}
              className="gap-1.5"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  <span>Deleting...</span>
                </>
              ) : (
                <>
                  <Trash2 className="size-3.5" />
                  <span>Delete Document</span>
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
