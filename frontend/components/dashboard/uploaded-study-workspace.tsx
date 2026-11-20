"use client";

import { useAuth } from "@clerk/nextjs";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Calendar,
  CheckCircle2,
  ExternalLink,
  Eye,
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
  Zap,
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
  DocumentGenerationStatusResponse,
  DocumentResponse,
  StudyResourceResponse,
  StudyResourceType,
  deleteDocument,
  getDocumentExtraction,
  getDocumentFileBlob,
  getDocumentGenerationStatus,
  getStudyResources,
  regenerateStudyResource,
  reprocessDocument,
} from "@/lib/api";
import { formatFileSize } from "@/components/dashboard/upload-dialog";
import { GenerateStudyDialog } from "@/components/dashboard/generate-study-dialog";
import { StudyNotesView } from "@/components/dashboard/study-notes-view";
import { StudyQuestionsView } from "@/components/dashboard/study-questions-view";
import { StudyFlashcardsView } from "@/components/dashboard/study-flashcards-view";
import { StudyQuizView } from "@/components/dashboard/study-quiz-view";

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

  // Phase 7 AI Study Resources State
  const [resources, setResources] = useState<StudyResourceResponse[]>([]);
  const [generationStatus, setGenerationStatus] = useState<DocumentGenerationStatusResponse | null>(null);
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState<Record<string, boolean>>({});

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

  // 1. Fetch text extraction status
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

  // 2. Fetch AI study resources and generation status
  const fetchResourcesAndStatus = useCallback(async () => {
    try {
      const [resList, statusData] = await Promise.all([
        getStudyResources(document.id, getToken),
        getDocumentGenerationStatus(document.id, getToken),
      ]);
      setResources(resList);
      setGenerationStatus(statusData);
      setDocState((prev) => ({
        ...prev,
        status: statusData.document_status as DocumentResponse["status"],
      }));
      return statusData;
    } catch {
      return null;
    }
  }, [document.id, getToken]);

  useEffect(() => {
    let isCancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;

    async function poll() {
      const statusData = await fetchResourcesAndStatus();
      if (isCancelled || !statusData) return;

      // Check if any resource is currently pending or generating
      const hasActiveJobs = Object.values(statusData.resources).some(
        (r) => r.status === "pending" || r.status === "generating"
      );

      if (hasActiveJobs) {
        pollTimer = setTimeout(poll, 2500);
      }
    }

    poll();

    return () => {
      isCancelled = true;
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, [fetchResourcesAndStatus]);

  // Handle regeneration of a specific resource type
  const handleRegenerate = async (type: StudyResourceType) => {
    setIsRegenerating((prev) => ({ ...prev, [type]: true }));
    try {
      await regenerateStudyResource(document.id, type, getToken);
      await fetchResourcesAndStatus();
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : `Failed to regenerate ${type}. Please try again.`;
      alert(message);
    } finally {
      setIsRegenerating((prev) => ({ ...prev, [type]: false }));
    }
  };

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
      if (!pdfBlobUrl) {
        const blob = await getDocumentFileBlob(document.id, getToken);
        const url = URL.createObjectURL(blob);
        setPdfBlobUrl(url);
      }
      setViewingPdf(true);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to load PDF file.";
      setPdfError(message);
    } finally {
      setLoadingPdf(false);
    }
  };

  const handleOpenInNewTab = async () => {
    try {
      setLoadingPdf(true);
      setPdfError(null);
      let url = pdfBlobUrl;
      if (!url) {
        const blob = await getDocumentFileBlob(document.id, getToken);
        url = URL.createObjectURL(blob);
        setPdfBlobUrl(url);
      }
      window.open(url, "_blank");
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to open PDF file.";
      setPdfError(message);
    } finally {
      setLoadingPdf(false);
    }
  };

  const handleDelete = async () => {
    try {
      setIsDeleting(true);
      await deleteDocument(document.id, getToken);
      setDeleteDialogOpen(false);
      router.push("/dashboard");
    } catch {
      alert("Failed to delete document. Please try again.");
      setIsDeleting(false);
    }
  };

  // Find specific active study resources
  const notesResource = resources.find((r) => r.resource_type === "notes") || null;
  const questionsResource = resources.find((r) => r.resource_type === "questions") || null;
  const flashcardsResource = resources.find((r) => r.resource_type === "flashcards") || null;
  const quizResource = resources.find((r) => r.resource_type === "quiz") || null;
  const summaryResource = resources.find((r) => r.resource_type === "summary") || null;

  const isExtractionDone =
    docState.status === "completed" ||
    docState.status === "generating" ||
    extraction?.extraction_status === "completed";

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-background">
      {/* Workspace Top Header */}
      <WorkspaceHeader
        title={displayTitle}
        subject="PDF Document"
        classLevel="Uploaded"
      />

      {/* Main Content Body */}
      <main className="flex-1 overflow-y-auto px-4 md:px-8">
        {/* ========================================================= */}
        {/* 1. NOTES TAB */}
        {/* ========================================================= */}
        {activeTab === "notes" && (
          <div className="mx-auto w-full max-w-3xl pb-28 pt-6 text-foreground">
            {/* Header Document Summary Card */}
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
                      Ready
                    </Badge>
                  )}
                  {docState.status === "generating" && (
                    <Badge className="bg-amber-500/10 font-semibold text-amber-600 dark:text-amber-400 capitalize hover:bg-amber-500/15 border border-amber-500/20">
                      <Loader2 className="mr-1 size-3 animate-spin" />
                      Generating AI
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

              {/* Action Buttons Toolbar */}
              <div className="mt-2 flex flex-wrap items-center gap-2.5 border-t pt-4">
                {isExtractionDone && (
                  <Button
                    size="sm"
                    onClick={() => setGenerateDialogOpen(true)}
                    className="gap-1.5 shadow-xs"
                  >
                    <Sparkles className="size-3.5" />
                    <span>Generate Study Materials</span>
                  </Button>
                )}

                <Button
                  variant="outline"
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

            {/* Extraction Status Banners (when not done) */}
            {docState.status === "extracting" && (
              <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/5 p-5">
                <div className="flex items-center gap-2 font-semibold text-foreground">
                  <Loader2 className="size-4 animate-spin text-amber-500" />
                  <span>Extracting Text & Document Structure...</span>
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  The extraction engine is parsing pages, identifying metadata, and evaluating text quality.
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
                    <XCircle className="size-4" />
                    <span>Text Extraction Failed</span>
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
                  {extraction?.error_message ||
                    "We encountered an issue extracting text from this PDF. Please retry extraction."}
                </p>
              </div>
            )}

            {/* Smart Notes View */}
            {isExtractionDone && (
              <StudyNotesView
                notesResource={notesResource}
                summaryResource={summaryResource}
                isRegenerating={!!(isRegenerating.notes || isRegenerating.summary)}
                onRegenerate={handleRegenerate}
                onOpenGenerateDialog={() => setGenerateDialogOpen(true)}
              />
            )}
          </div>
        )}

        {/* ========================================================= */}
        {/* 2. QUESTIONS TAB */}
        {/* ========================================================= */}
        {activeTab === "questions" && (
          <div>
            {isExtractionDone ? (
              <StudyQuestionsView
                questionsResource={questionsResource}
                isRegenerating={!!isRegenerating.questions}
                onRegenerate={() => handleRegenerate("questions")}
                onOpenGenerateDialog={() => setGenerateDialogOpen(true)}
              />
            ) : (
              <div className="pb-28 pt-6">
                <WorkspaceEmptyState
                  icon={HelpCircle}
                  title="Extraction Pending"
                  phaseBadge="PDF Extraction Required"
                  description="Wait for text extraction to finish before synthesizing exam-oriented questions."
                  features={[
                    "Selectable text extraction in progress",
                    "Study questions will unlock once extraction completes",
                  ]}
                  onAction={() => setActiveTab("notes")}
                  actionLabel="Back to Document Info"
                />
              </div>
            )}
          </div>
        )}

        {/* ========================================================= */}
        {/* 3. FLASHCARDS TAB */}
        {/* ========================================================= */}
        {activeTab === "flashcards" && (
          <div>
            {isExtractionDone ? (
              <StudyFlashcardsView
                flashcardsResource={flashcardsResource}
                isRegenerating={!!isRegenerating.flashcards}
                onRegenerate={() => handleRegenerate("flashcards")}
                onOpenGenerateDialog={() => setGenerateDialogOpen(true)}
              />
            ) : (
              <div className="pb-28 pt-6">
                <WorkspaceEmptyState
                  icon={Layers}
                  title="Extraction Pending"
                  phaseBadge="PDF Extraction Required"
                  description="Wait for text extraction to finish before generating active-recall flashcards."
                  features={[
                    "Selectable text extraction in progress",
                    "Flashcards will unlock once extraction completes",
                  ]}
                  onAction={() => setActiveTab("notes")}
                  actionLabel="Back to Document Info"
                />
              </div>
            )}
          </div>
        )}

        {/* ========================================================= */}
        {/* 4. QUIZ TAB */}
        {/* ========================================================= */}
        {activeTab === "quiz" && (
          <div>
            {isExtractionDone ? (
              <StudyQuizView
                documentId={document.id}
                quizResource={quizResource}
                getToken={getToken}
                isRegenerating={!!isRegenerating.quiz}
                onRegenerate={() => handleRegenerate("quiz")}
                onOpenGenerateDialog={() => setGenerateDialogOpen(true)}
              />
            ) : (
              <div className="pb-28 pt-6">
                <WorkspaceEmptyState
                  icon={Zap}
                  title="Extraction Pending"
                  phaseBadge="PDF Extraction Required"
                  description="Wait for text extraction to finish before generating practice MCQ quizzes."
                  features={[
                    "Selectable text extraction in progress",
                    "Practice quizzes will unlock once extraction completes",
                  ]}
                  onAction={() => setActiveTab("notes")}
                  actionLabel="Back to Document Info"
                />
              </div>
            )}
          </div>
        )}

        {/* ========================================================= */}
        {/* 5. AI TALK TAB (Coming in Phase 9) */}
        {/* ========================================================= */}
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
              actionLabel="Back to Study Workspace"
            />
          </div>
        )}
      </main>

      {/* Floating Bottom Navigation */}
      <WorkspaceNavigation
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      {/* Generate Study Materials Dialog */}
      <GenerateStudyDialog
        open={generateDialogOpen}
        onOpenChange={setGenerateDialogOpen}
        documentId={document.id}
        documentTitle={docState.original_filename}
        generationStatus={generationStatus}
        getToken={getToken}
        onGenerationStarted={fetchResourcesAndStatus}
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
              all associated workspace and AI study resources. This action cannot be undone.
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
