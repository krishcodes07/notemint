"use client";

import { useAuth } from "@clerk/nextjs";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ExternalLink,
  Eye,
  FileCheck2,
  FileSearch,
  FileText,
  HardDrive,
  HelpCircle,
  Layers,
  Loader2,
  Lock,
  RefreshCw,
  Sparkles,
  Trash2,
  XCircle,
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
import {
  DocumentExtractionResponse,
  DocumentResponse,
  deleteDocument,
  getDocumentExtraction,
  getDocumentFileBlob,
  reprocessDocument,
} from "@/lib/api";
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

  const [docState, setDocState] = useState<DocumentResponse>(document);
  const [extraction, setExtraction] = useState<DocumentExtractionResponse | null>(null);
  const [, setLoadingExtraction] = useState(true);
  const [isReprocessing, setIsReprocessing] = useState(false);

  const displayTitle = docState.original_filename.replace(/\.pdf$/i, "");
  const formattedDate = new Date(docState.created_at).toLocaleDateString(
    undefined,
    {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }
  );

  useEffect(() => {
    let isCancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;

    async function fetchExtraction() {
      try {
        const ext = await getDocumentExtraction(document.id, getToken);
        if (!isCancelled) {
          setExtraction(ext);
          setLoadingExtraction(false);
          setDocState((prev) => ({
            ...prev,
            status: ext.document_status,
            page_count: ext.page_count ?? prev.page_count,
          }));

          // Poll automatically while in non-terminal processing state
          if (ext.document_status === "uploaded" || ext.document_status === "extracting") {
            pollTimer = setTimeout(fetchExtraction, 2500);
          }
        }
      } catch {
        if (!isCancelled) {
          setLoadingExtraction(false);
        }
      }
    }

    fetchExtraction();

    return () => {
      isCancelled = true;
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, [document.id, getToken]);

  const handleReprocess = async () => {
    try {
      setIsReprocessing(true);
      await reprocessDocument(document.id, getToken);
      setDocState((prev) => ({ ...prev, status: "uploaded" }));
      if (extraction) {
        setExtraction({
          ...extraction,
          document_status: "uploaded",
          extraction_status: "pending",
          error_message: null,
        });
      }
      const ext = await getDocumentExtraction(document.id, getToken);
      setExtraction(ext);
      setDocState((prev) => ({ ...prev, status: ext.document_status }));
    } catch {
      alert("Failed to initiate extraction. Please try again.");
    } finally {
      setIsReprocessing(false);
    }
  };

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
                      {docState.original_filename}
                    </h2>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <HardDrive className="size-3.5" />
                        <span>{formatFileSize(docState.file_size_bytes)}</span>
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Calendar className="size-3.5" />
                        <span>{formattedDate}</span>
                      </span>
                      {docState.page_count != null && (
                        <>
                          <span>•</span>
                          <span className="flex items-center gap-1 font-medium text-foreground">
                            <FileText className="size-3.5" />
                            <span>
                              {docState.page_count}{" "}
                              {docState.page_count === 1 ? "page" : "pages"}
                            </span>
                          </span>
                        </>
                      )}
                      {extraction?.total_characters ? (
                        <>
                          <span>•</span>
                          <span className="flex items-center gap-1 text-muted-foreground">
                            <span>
                              {extraction.total_characters.toLocaleString()} chars
                            </span>
                          </span>
                        </>
                      ) : null}
                      <span>•</span>
                      <span className="flex items-center gap-1 text-primary">
                        <Lock className="size-3" />
                        <span>Private Storage</span>
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-start">
                  {docState.status === "completed" && (
                    <Badge className="bg-primary/10 font-semibold text-primary capitalize hover:bg-primary/15 border border-primary/20">
                      <CheckCircle2 className="mr-1 size-3" />
                      Completed
                    </Badge>
                  )}
                  {docState.status === "extracting" && (
                    <Badge className="bg-amber-500/10 font-semibold text-amber-600 dark:text-amber-400 capitalize hover:bg-amber-500/15 border border-amber-500/20">
                      <Loader2 className="mr-1 size-3 animate-spin" />
                      Extracting
                    </Badge>
                  )}
                  {docState.status === "failed" && (
                    <Badge className="bg-destructive/10 font-semibold text-destructive capitalize hover:bg-destructive/15 border border-destructive/20">
                      <XCircle className="mr-1 size-3" />
                      Failed
                    </Badge>
                  )}
                  {docState.status === "uploaded" && (
                    <Badge className="bg-muted font-semibold text-muted-foreground capitalize hover:bg-muted border border-border">
                      Uploaded
                    </Badge>
                  )}
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

                {(docState.status === "failed" || docState.status === "uploaded") && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleReprocess}
                    disabled={isReprocessing}
                    className="gap-1.5"
                  >
                    {isReprocessing ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="size-3.5" />
                    )}
                    <span>{docState.status === "failed" ? "Retry Extraction" : "Run Extraction"}</span>
                  </Button>
                )}

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

            {/* Extraction Status Feedback Banner */}
            {docState.status === "completed" && (
              <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-primary/25 bg-brand-soft/20 p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-semibold text-foreground">
                    <CheckCircle2 className="size-4 text-primary" />
                    <span>PDF Extraction Complete</span>
                  </div>
                  <Badge variant="outline" className="text-[10px] font-mono border-primary/30 text-primary">
                    PyMuPDF
                  </Badge>
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Selectable text and page-level contents were extracted from all{" "}
                  {docState.page_count || 1} pages
                  {extraction?.total_characters
                    ? ` (${extraction.total_characters.toLocaleString()} characters total)`
                    : ""}
                  . Text is normalized and ready for Phase 7 AI learning resource synthesis.
                </p>
                <div className="mt-1 flex flex-wrap gap-2 text-[11px]">
                  <span className="rounded-md border bg-card/80 px-2.5 py-1 text-muted-foreground">
                    Pages: <strong className="text-foreground">{docState.page_count || 1}</strong>
                  </span>
                  {extraction?.total_characters ? (
                    <span className="rounded-md border bg-card/80 px-2.5 py-1 text-muted-foreground">
                      Characters:{" "}
                      <strong className="text-foreground">
                        {extraction.total_characters.toLocaleString()}
                      </strong>
                    </span>
                  ) : null}
                  <span className="rounded-md border bg-card/80 px-2.5 py-1 text-muted-foreground">
                    Layout: <strong className="text-primary">Clean Text</strong>
                  </span>
                </div>
              </div>
            )}

            {docState.status === "extracting" && (
              <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/5 p-5">
                <div className="flex items-center gap-2 font-semibold text-foreground">
                  <Loader2 className="size-4 animate-spin text-amber-500" />
                  <span>Extracting Text & Document Structure...</span>
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  The extraction engine is parsing pages, identifying metadata, normalizing whitespace,
                  and evaluating text quality. This workspace refreshes automatically.
                </p>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-amber-500/20">
                  <div className="h-full w-1/2 animate-pulse rounded-full bg-amber-500" />
                </div>
              </div>
            )}

            {docState.status === "failed" && (
              <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-destructive/25 bg-destructive/5 p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-semibold text-destructive">
                    {extraction?.is_scanned || extraction?.quality?.ocr_required ? (
                      <AlertTriangle className="size-4" />
                    ) : (
                      <XCircle className="size-4" />
                    )}
                    <span>
                      {extraction?.is_scanned || extraction?.quality?.ocr_required
                        ? "Scanned / Image-Based PDF Detected"
                        : "Text Extraction Failed"}
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleReprocess}
                    disabled={isReprocessing}
                    className="h-7 gap-1 text-xs"
                  >
                    {isReprocessing ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <RefreshCw className="size-3" />
                    )}
                    <span>Retry Extraction</span>
                  </Button>
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {extraction?.is_scanned || extraction?.quality?.ocr_required
                    ? "This document contains scanned images without selectable text. Text extraction requires Optical Character Recognition (OCR), which will be available in an upcoming phase."
                    : extraction?.error_message ||
                      "We encountered an issue extracting text from this PDF. You can view the original file or retry extraction."}
                </p>
              </div>
            )}

            {docState.status === "uploaded" && (
              <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-border bg-card/60 p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-semibold text-foreground">
                    <FileSearch className="size-4 text-primary" />
                    <span>Document Queued for Background Extraction</span>
                  </div>
                  <Button
                    size="sm"
                    onClick={handleReprocess}
                    disabled={isReprocessing}
                    className="h-7 gap-1 text-xs"
                  >
                    {isReprocessing ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <RefreshCw className="size-3" />
                    )}
                    <span>Run Extraction Now</span>
                  </Button>
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Your PDF is securely stored in private object storage. Click &ldquo;Run Extraction Now&rdquo;
                  or start the Celery worker to extract page text and structure.
                </p>
              </div>
            )}

            {/* Phase 5/6/7 Pipeline Roadmap Card */}
            <div className="flex flex-col gap-4 rounded-2xl border bg-muted/30 p-6">
              <div className="flex items-center gap-2.5 text-xs font-bold uppercase tracking-wider text-primary">
                <FileCheck2 className="size-4" />
                <span>Document Ingestion Pipeline</span>
              </div>

              <div className="flex flex-col gap-3 text-sm leading-relaxed text-muted-foreground">
                <div className="flex items-start gap-3 rounded-xl border border-primary/20 bg-brand-soft/20 p-4 text-xs">
                  <CheckCircle2 className="size-4 shrink-0 text-primary translate-y-0.5" />
                  <div>
                    <p className="font-semibold text-foreground">
                      Phase 5 Complete: PDF Secured in Private Storage
                    </p>
                    <p className="mt-0.5 text-muted-foreground">
                      Document verified (%PDF- header and integrity checked) and stored in private
                      Neon Object Storage tied to your Clerk user profile.
                    </p>
                  </div>
                </div>

                <div
                  className={`flex items-start gap-3 rounded-xl border p-4 text-xs ${
                    docState.status === "completed"
                      ? "border-primary/20 bg-brand-soft/20"
                      : "bg-card/60"
                  }`}
                >
                  {docState.status === "completed" ? (
                    <CheckCircle2 className="size-4 shrink-0 text-primary translate-y-0.5" />
                  ) : (
                    <div className="flex size-4 shrink-0 items-center justify-center rounded-full border border-primary font-mono text-[10px] font-bold text-primary">
                      6
                    </div>
                  )}
                  <div>
                    <p className="font-semibold text-foreground">
                      {docState.status === "completed"
                        ? "Phase 6 Complete: PDF Extraction Engine"
                        : "Phase 6: PDF Extraction Engine"}
                    </p>
                    <p className="mt-0.5 text-muted-foreground">
                      {docState.status === "completed"
                        ? `Extracted text from ${docState.page_count || 1} pages with quality diagnostics, layout preservation, and character counts.`
                        : "Extracts text page-by-page, analyzes whitespace, detects scanned/image-based pages, and computes character counts."}
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
              description={`Exam-oriented questions and marking schemes for "${docState.original_filename}" will be synthesized in Phase 7 using the text extracted in Phase 6.`}
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
              description={`Spaced-repetition flashcards for "${docState.original_filename}" will be generated automatically in Phase 7.`}
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
              description={`Self-assessment quizzes tailored to "${docState.original_filename}" will arrive in Phase 7.`}
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
              description={`Your interactive Socratic tutor will be grounded directly in "${docState.original_filename}". You will be able to ask questions in English or Hindi.`}
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
