"use client";

import { useAuth } from "@clerk/nextjs";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BookOpen,
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  Eye,
  FileText,
  HardDrive,
  HelpCircle,
  Home,
  Layers,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  XCircle,
  Zap,
} from "lucide-react";
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
  DocumentIndexStatusResponse,
  DocumentResponse,
  StudyProgressOverview,
  StudyResourceResponse,
  StudyResourceType,
  deleteDocument,
  getDocumentExtraction,
  getDocumentFileBlob,
  getDocumentGenerationStatus,
  getDocumentIndexStatus,
  getStudyProgressOverview,
  getStudyResources,
  getAvailableTopics,
  regenerateStudyResource,
  reprocessDocument,
} from "@/lib/api";
import { formatFileSize } from "@/components/dashboard/upload-dialog";
import { GenerateStudyDialog } from "@/components/dashboard/generate-study-dialog";
import { StudySearchDialog } from "@/components/dashboard/study-search-dialog";
import { StudyNotesView } from "@/components/dashboard/study-notes-view";
import { StudyQuestionsView } from "@/components/dashboard/study-questions-view";
import { StudyFlashcardsView } from "@/components/dashboard/study-flashcards-view";
import { StudyQuizView } from "@/components/dashboard/study-quiz-view";
import { TeacherChatView } from "@/components/dashboard/teacher-chat-view";
import { cn } from "@/lib/utils";

interface UploadedStudyWorkspaceProps {
  document: DocumentResponse;
}

export function UploadedStudyWorkspace({
  document,
}: UploadedStudyWorkspaceProps) {
  const router = useRouter();
  const { getToken } = useAuth();

  const [activeTab, setActiveTab] = useState<WorkspaceTab>("home");
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [viewingPdf, setViewingPdf] = useState(false);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [pdfTargetPage, setPdfTargetPage] = useState<number | null>(null);
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const [docState, setDocState] = useState<DocumentResponse>(document);
  const [extraction, setExtraction] = useState<DocumentExtractionResponse | null>(null);
  const [, setLoadingExtraction] = useState(true);
  const [isReprocessing, setIsReprocessing] = useState(false);

  // Phase 7 & 8 AI Study Resources State
  const [resources, setResources] = useState<StudyResourceResponse[]>([]);
  const [generationStatus, setGenerationStatus] = useState<DocumentGenerationStatusResponse | null>(null);
  const [loadingResources, setLoadingResources] = useState(true);
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false);
  const [searchDialogOpen, setSearchDialogOpen] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState<Record<string, boolean>>({});

  // Phase 8 Persistent Study Progress State
  const [studyProgress, setStudyProgress] = useState<StudyProgressOverview | null>(null);
  const [indexStatus, setIndexStatus] = useState<DocumentIndexStatusResponse | null>(null);

  // Phase 11 Chapter Focus Topics State
  const [availableTopics, setAvailableTopics] = useState<string[]>([]);

  // Optimistic generation tracker & live polling interval
  const [optimisticGenerating, setOptimisticGenerating] = useState<StudyResourceType[]>([]);
  const [pollInterval, setPollInterval] = useState<number | null>(null);

  // Active study resources currently being generated
  const activeGeneratingTypes = (
    ["notes", "questions", "flashcards", "quiz", "summary"] as StudyResourceType[]
  ).filter((type) => {
    const res = resources.find((r) => r.resource_type === type);
    if (res && res.status === "completed") return false;

    if (optimisticGenerating.includes(type)) return true;
    if (res && (res.status === "generating" || res.status === "pending")) return true;

    const status = generationStatus?.resources[type]?.status;
    return status === "generating" || status === "pending";
  });

  const isAnyGenerating =
    docState.status === "generating" || activeGeneratingTypes.length > 0;

  // Find specific active study resources
  const notesResource = resources.find((r) => r.resource_type === "notes") || null;
  const questionsResource = resources.find((r) => r.resource_type === "questions") || null;
  const flashcardsResource = resources.find((r) => r.resource_type === "flashcards") || null;
  const quizResource = resources.find((r) => r.resource_type === "quiz") || null;
  const summaryResource = resources.find((r) => r.resource_type === "summary") || null;

  // Resource items count helpers for Home launch cards
  const questionsList = (questionsResource?.content as unknown as { questions?: unknown[] })?.questions;
  const questionsCount = Array.isArray(questionsList) ? questionsList.length : null;

  const flashcardsList = (flashcardsResource?.content as unknown as { flashcards?: unknown[] })?.flashcards;
  const flashcardsCount = Array.isArray(flashcardsList) ? flashcardsList.length : null;

  const quizList = (quizResource?.content as unknown as { questions?: unknown[] })?.questions;
  const quizCount = Array.isArray(quizList) ? quizList.length : null;

  const notesSections = (notesResource?.content as unknown as { sections?: unknown[] })?.sections;
  const notesCount = Array.isArray(notesSections) ? notesSections.length : null;

  // Space title determination: while generating/before generation, show raw PDF filename.
  // Once generated, automatically rename with AI title.
  const rawPdfName = docState.original_filename.replace(/\.pdf$/i, "");
  const aiCandidateTitle =
    docState.title ||
    (notesResource?.content as unknown as { title?: string })?.title ||
    (summaryResource?.content as unknown as { title?: string })?.title ||
    null;

  const isAiNamed = Boolean(
    aiCandidateTitle &&
      aiCandidateTitle.trim().length > 0 &&
      aiCandidateTitle.trim().toLowerCase() !== "smart study notes" &&
      aiCandidateTitle.trim().toLowerCase() !== "chapter summary" &&
      aiCandidateTitle.trim().toLowerCase() !== "practice quiz" &&
      aiCandidateTitle.trim().toLowerCase() !== "study flashcards" &&
      aiCandidateTitle.trim().toLowerCase() !== "important questions & answers" &&
      aiCandidateTitle.trim().toLowerCase() !== "descriptive document title"
  );

  const displayTitle = isAiNamed ? aiCandidateTitle!.trim() : rawPdfName;

  // Dynamically update document tab title with the real workspace name
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.title = `${displayTitle} | NoteMint`;
    }
  }, [displayTitle]);

  // Notify sidebar and document lists when document is AI-renamed
  useEffect(() => {
    if (isAiNamed && typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("notemint:document-renamed", {
          detail: { id: document.id, title: displayTitle },
        })
      );
      window.dispatchEvent(new CustomEvent("notemint:documents-changed"));
    }
  }, [isAiNamed, displayTitle, document.id]);

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

  // Load initial resources on mount or when document changes
  useEffect(() => {
    let isCancelled = false;
    setLoadingResources(true);

    async function loadInitial() {
      try {
        await fetchResourcesAndStatus();
      } finally {
        if (!isCancelled) {
          setLoadingResources(false);
        }
      }
    }

    void loadInitial();

    return () => {
      isCancelled = true;
    };
  }, [fetchResourcesAndStatus]);

  // 3. Fetch persistent study progress overview
  const refreshStudyProgress = useCallback(async () => {
    try {
      const data = await getStudyProgressOverview(document.id, getToken);
      setStudyProgress(data);
    } catch {
      // Keep silent on progress fetch error
    }
  }, [document.id, getToken]);

  useEffect(() => {
    let isCancelled = false;
    async function loadInitialProgress() {
      try {
        const data = await getStudyProgressOverview(document.id, getToken);
        if (!isCancelled) setStudyProgress(data);
      } catch {
        // Keep silent on initial progress fetch
      }
    }
    loadInitialProgress();
    return () => {
      isCancelled = true;
    };
  }, [document.id, getToken]);

  // Continuous reactive polling while generating or when jobs are active
  useEffect(() => {
    let isCancelled = false;

    const hasActiveJobs =
      docState.status === "generating" ||
      docState.status === "uploaded" ||
      docState.status === "extracting" ||
      activeGeneratingTypes.length > 0 ||
      pollInterval !== null;

    if (!hasActiveJobs) return;

    const timer = setInterval(async () => {
      try {
        const [resList, statusData, extData] = await Promise.all([
          getStudyResources(document.id, getToken),
          getDocumentGenerationStatus(document.id, getToken),
          getDocumentExtraction(document.id, getToken),
        ]);

        if (isCancelled) return;

        setResources(resList);
        setGenerationStatus(statusData);
        if (extData) setExtraction(extData);

        // Clear optimisticGenerating only for types that have actually completed
        setOptimisticGenerating((prev) =>
          prev.filter((type) => {
            const completed = resList.some(
              (r) => r.resource_type === type && r.status === "completed"
            );
            return !completed;
          })
        );

        const anyStillGenerating = Object.values(statusData.resources).some(
          (r) => r.status === "pending" || r.status === "generating"
        );

        setDocState((prev) => ({
          ...prev,
          status: statusData.document_status as DocumentResponse["status"],
          page_count: extData?.page_count ?? prev.page_count,
        }));

        if (!anyStillGenerating) {
          setPollInterval(null);
          refreshStudyProgress();
        }
      } catch {
        // Silently continue polling
      }
    }, 2000);

    return () => {
      isCancelled = true;
      clearInterval(timer);
    };
  }, [
    document.id,
    getToken,
    docState.status,
    activeGeneratingTypes.length,
    pollInterval,
    refreshStudyProgress,
  ]);

  const handleGenerationStarted = (selectedTypes: StudyResourceType[]) => {
    setOptimisticGenerating(selectedTypes);
    setPollInterval(2000);
    fetchResourcesAndStatus();
  };

  // Handle regeneration of a specific resource type
  const handleRegenerate = async (type: StudyResourceType) => {
    setIsRegenerating((prev) => ({ ...prev, [type]: true }));
    try {
      await regenerateStudyResource(document.id, type, getToken);
      await fetchResourcesAndStatus();
      await refreshStudyProgress();
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

  const handleOpenPdf = async (page?: number) => {
    try {
      setLoadingPdf(true);
      setPdfError(null);
      setPdfTargetPage(page ?? null);
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

  const handleSelectSearchResult = (
    resourceType: "notes" | "summary" | "questions" | "flashcards" | "quiz",
    targetId: string | null
  ) => {
    if (resourceType === "notes" || resourceType === "summary") {
      setActiveTab("notes");
    } else if (resourceType === "questions") {
      setActiveTab("questions");
    } else if (resourceType === "flashcards") {
      setActiveTab("flashcards");
    } else if (resourceType === "quiz") {
      setActiveTab("quiz");
    }

    if (targetId && typeof window !== "undefined") {
      setTimeout(() => {
        const el = window.document.getElementById(targetId);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }, 150);
    }
  };

  const isExtractionDone =
    docState.status === "completed" ||
    docState.status === "generating" ||
    extraction?.extraction_status === "completed";

  // Phase 10: Fetch RAG vector index status
  useEffect(() => {
    let isCancelled = false;
    async function fetchIndexStatus() {
      try {
        const idx = await getDocumentIndexStatus(document.id, getToken);
        if (!isCancelled) {
          setIndexStatus(idx);
        }
      } catch {}
    }
    if (isExtractionDone) {
      fetchIndexStatus();
    }
    return () => {
      isCancelled = true;
    };
  }, [document.id, getToken, isExtractionDone]);

  // Phase 11: Fetch available topics for custom generation
  useEffect(() => {
    let isCancelled = false;
    async function fetchTopics() {
      try {
        const data = await getAvailableTopics(document.id, getToken);
        if (!isCancelled && data.topics) {
          setAvailableTopics(data.topics);
        }
      } catch {}
    }
    if (isExtractionDone) {
      fetchTopics();
    }
    return () => {
      isCancelled = true;
    };
  }, [document.id, getToken, isExtractionDone]);

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-background">
      {/* Workspace Top Header with Animated Rename */}
      <WorkspaceHeader
        title={displayTitle}
        onSearchClick={() => setSearchDialogOpen(true)}
      />

      {/* Main Content Body */}
      <main className={cn("flex-1 px-2 sm:px-4 md:px-8", activeTab === "ai-talk" ? "overflow-hidden flex flex-col min-h-0 h-full max-h-full no-scrollbar" : "overflow-y-auto")}>
        {/* ========================================================= */}
        {/* 0. HOME TAB (Workspace Hub) */}
        {/* ========================================================= */}
        {activeTab === "home" && (
          <div className="mx-auto w-full max-w-4xl pb-28 pt-6 text-foreground space-y-6">
            {/* Header Document Summary Card */}
            <div className="flex flex-col gap-4 rounded-2xl border bg-card/60 p-6 shadow-xs">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-start gap-3.5 min-w-0">
                  <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-brand-soft text-primary">
                    <FileText className="size-6" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2
                        key={displayTitle}
                        className="truncate text-lg font-bold tracking-tight text-foreground sm:text-xl transition-all duration-500 animate-in fade-in slide-in-from-bottom-1"
                        title={displayTitle}
                      >
                        {displayTitle}
                      </h2>
                    </div>
                    {displayTitle !== docState.original_filename.replace(/\.pdf$/i, "") && (
                      <div
                        className="text-[11px] text-muted-foreground font-mono mt-0.5 truncate max-w-full"
                        title={docState.original_filename}
                      >
                        Source: {docState.original_filename}
                      </div>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-2.5 text-xs sm:text-sm text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <HardDrive className="size-3.5" />
                        <span>{formatFileSize(docState.file_size_bytes)}</span>
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1.5">
                        <Calendar className="size-3.5" />
                        <span>{formattedDate}</span>
                      </span>
                      {docState.page_count != null && (
                        <>
                          <span>•</span>
                          <span className="flex items-center gap-1.5 font-medium text-foreground">
                            <FileText className="size-3.5 text-primary" />
                            <span>
                              {docState.page_count}{" "}
                              {docState.page_count === 1 ? "page" : "pages"}
                            </span>
                          </span>
                        </>
                      )}
                      {indexStatus?.status === "indexing" && (
                        <>
                          <span>•</span>
                          <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                            <Loader2 className="size-3 animate-spin" />
                            <span>Indexing...</span>
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Primary Action: Generate / AI Study Materials */}
                {isExtractionDone && (
                  <Button
                    onClick={() => setGenerateDialogOpen(true)}
                    disabled={isAnyGenerating}
                    className="gap-2 shrink-0 font-semibold rounded-xl text-sm transition-all"
                  >
                    {isAnyGenerating ? (
                      <>
                        <Loader2 className="size-4 animate-spin text-primary-foreground" />
                        <span>Generating Study Materials...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="size-4" />
                        <span>Generate Study Materials</span>
                      </>
                    )}
                  </Button>
                )}
              </div>

              {/* PDF Actions & Delete */}
              <div className="flex flex-wrap items-center gap-2.5 border-t pt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleOpenPdf()}
                  disabled={loadingPdf}
                  className="gap-1.5 rounded-xl text-xs sm:text-sm"
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
                  className="gap-1.5 rounded-xl text-xs sm:text-sm"
                >
                  <ExternalLink className="size-3.5" />
                  <span>Open in Tab</span>
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSearchDialogOpen(true)}
                  className="gap-1.5 rounded-xl text-xs sm:text-sm text-muted-foreground hover:text-foreground"
                >
                  <Search className="size-3.5 text-primary" />
                  <span>Search Materials</span>
                </Button>

                {(docState.status === "failed" || docState.status === "uploaded") && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleReprocess}
                    disabled={isReprocessing}
                    className="gap-1.5 rounded-xl text-xs sm:text-sm"
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
                  className="ml-auto gap-1.5 rounded-xl text-xs sm:text-sm text-destructive hover:bg-destructive/10 hover:text-destructive"
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
              <div className="flex flex-col gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/5 p-5">
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
              <div className="flex flex-col gap-3 rounded-2xl border border-destructive/25 bg-destructive/5 p-5">
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

            {/* Persistent Study Progress Banner */}
            {isExtractionDone && studyProgress && (
              <div className="rounded-2xl border border-primary/20 bg-card/60 p-5 sm:p-6 shadow-xs">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3.5">
                  <div className="flex items-center gap-2 text-sm sm:text-base font-bold text-foreground">
                    <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <CheckCircle2 className="size-4" />
                    </div>
                    <span>Revision Overview</span>
                  </div>
                  {studyProgress.last_studied_at && (
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Clock className="size-3.5" />
                      <span>
                        Last active:{" "}
                        {new Date(studyProgress.last_studied_at).toLocaleDateString(
                          undefined,
                          { month: "short", day: "numeric" }
                        )}
                      </span>
                    </span>
                  )}
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="flex flex-col rounded-xl border border-border/50 bg-background/50 p-3.5">
                    <span className="text-xs font-semibold text-muted-foreground">
                      Flashcards
                    </span>
                    <span className="mt-1 text-lg sm:text-xl font-bold text-foreground">
                      {studyProgress.reviewed_flashcards}
                      <span className="text-sm font-normal text-muted-foreground">
                        /{studyProgress.total_flashcards}
                      </span>
                    </span>
                    <span className="mt-0.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                      {studyProgress.mastered_flashcards} mastered
                    </span>
                  </div>

                  <div className="flex flex-col rounded-xl border border-border/50 bg-background/50 p-3.5">
                    <span className="text-xs font-semibold text-muted-foreground">
                      Important Questions
                    </span>
                    <span className="mt-1 text-lg sm:text-xl font-bold text-foreground">
                      {studyProgress.bookmarked_questions_count}
                    </span>
                    <span className="mt-0.5 text-xs text-muted-foreground">
                      Bookmarked for revision
                    </span>
                  </div>

                  <div className="flex flex-col rounded-xl border border-border/50 bg-background/50 p-3.5">
                    <span className="text-xs font-semibold text-muted-foreground">
                      Quiz Attempts
                    </span>
                    <span className="mt-1 text-lg sm:text-xl font-bold text-foreground">
                      {studyProgress.quiz_attempts_count}
                    </span>
                    <span className="mt-0.5 text-xs text-muted-foreground">
                      Completed tests
                    </span>
                  </div>

                  <div className="flex flex-col rounded-xl border border-border/50 bg-background/50 p-3.5">
                    <span className="text-xs font-semibold text-muted-foreground">
                      Best Quiz Score
                    </span>
                    <span className="mt-1 text-lg sm:text-xl font-bold text-foreground">
                      {studyProgress.best_quiz_score != null
                        ? `${studyProgress.best_quiz_score}%`
                        : "—"}
                    </span>
                    <span className="mt-0.5 text-xs text-muted-foreground">
                      {studyProgress.latest_quiz_score != null
                        ? `Latest: ${studyProgress.latest_quiz_score}%`
                        : "Not taken yet"}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Study Modes Quick Launch Hub */}
            <div className="space-y-3.5">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold tracking-tight text-foreground sm:text-lg">
                  Study Modes & Materials
                </h3>
                <span className="text-xs text-muted-foreground">
                  Select a mode to begin studying
                </span>
              </div>

              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
                {/* 1. Smart Notes & Summary */}
                <div
                  onClick={() => setActiveTab("notes")}
                  className="group cursor-pointer flex flex-col justify-between rounded-2xl border border-border/80 bg-card/60 p-5 hover:border-primary/50 hover:bg-card/90 transition-all shadow-xs"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <div className="flex size-10 items-center justify-center rounded-xl bg-brand-soft text-primary">
                        <BookOpen className="size-5" />
                      </div>
                      {activeGeneratingTypes.includes("notes") || activeGeneratingTypes.includes("summary") ? (
                        <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 font-medium">
                          <Loader2 className="size-3 animate-spin" />
                          <span>Generating</span>
                        </span>
                      ) : notesResource && notesResource.status === "completed" ? (
                        <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                          {notesCount ? `${notesCount} Sections` : "Ready"}
                        </span>
                      ) : (
                        <span className="text-xs font-medium text-muted-foreground">
                          Not generated
                        </span>
                      )}
                    </div>
                    <h4 className="mt-3 text-base font-bold text-foreground group-hover:text-primary transition-colors">
                      Smart Notes & Summary
                    </h4>
                    <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground line-clamp-2">
                      Structured concept breakdowns, key takeaways, and comprehensive chapter summary.
                    </p>
                  </div>
                  <div className="mt-4 flex items-center gap-1.5 text-xs font-semibold text-primary">
                    <span>Open Notes</span>
                    <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-1" />
                  </div>
                </div>

                {/* 2. Important Questions */}
                <div
                  onClick={() => setActiveTab("questions")}
                  className="group cursor-pointer flex flex-col justify-between rounded-2xl border border-border/80 bg-card/60 p-5 hover:border-primary/50 hover:bg-card/90 transition-all shadow-xs"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <div className="flex size-10 items-center justify-center rounded-xl bg-brand-soft text-primary">
                        <HelpCircle className="size-5" />
                      </div>
                      {activeGeneratingTypes.includes("questions") ? (
                        <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 font-medium">
                          <Loader2 className="size-3 animate-spin" />
                          <span>Generating</span>
                        </span>
                      ) : questionsResource && questionsResource.status === "completed" ? (
                        <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                          {questionsCount ? `${questionsCount} Questions` : "Ready"}
                        </span>
                      ) : (
                        <span className="text-xs font-medium text-muted-foreground">
                          Not generated
                        </span>
                      )}
                    </div>
                    <h4 className="mt-3 text-base font-bold text-foreground group-hover:text-primary transition-colors">
                      Important Questions
                    </h4>
                    <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground line-clamp-2">
                      Exam-oriented questions with detailed model explanations and bookmarking.
                    </p>
                  </div>
                  <div className="mt-4 flex items-center gap-1.5 text-xs font-semibold text-primary">
                    <span>Study Questions</span>
                    <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-1" />
                  </div>
                </div>

                {/* 3. Flashcards */}
                <div
                  onClick={() => setActiveTab("flashcards")}
                  className="group cursor-pointer flex flex-col justify-between rounded-2xl border border-border/80 bg-card/60 p-5 hover:border-primary/50 hover:bg-card/90 transition-all shadow-xs"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <div className="flex size-10 items-center justify-center rounded-xl bg-brand-soft text-primary">
                        <Layers className="size-5" />
                      </div>
                      {activeGeneratingTypes.includes("flashcards") ? (
                        <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 font-medium">
                          <Loader2 className="size-3 animate-spin" />
                          <span>Generating</span>
                        </span>
                      ) : flashcardsResource && flashcardsResource.status === "completed" ? (
                        <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                          {flashcardsCount ? `${flashcardsCount} Cards` : "Ready"}
                        </span>
                      ) : (
                        <span className="text-xs font-medium text-muted-foreground">
                          Not generated
                        </span>
                      )}
                    </div>
                    <h4 className="mt-3 text-base font-bold text-foreground group-hover:text-primary transition-colors">
                      Study Flashcards
                    </h4>
                    <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground line-clamp-2">
                      Spaced repetition flip cards with self-assessment mastery tracking.
                    </p>
                  </div>
                  <div className="mt-4 flex items-center gap-1.5 text-xs font-semibold text-primary">
                    <span>Review Flashcards</span>
                    <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-1" />
                  </div>
                </div>

                {/* 4. Quiz */}
                <div
                  onClick={() => setActiveTab("quiz")}
                  className="group cursor-pointer flex flex-col justify-between rounded-2xl border border-border/80 bg-card/60 p-5 hover:border-primary/50 hover:bg-card/90 transition-all shadow-xs"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <div className="flex size-10 items-center justify-center rounded-xl bg-brand-soft text-primary">
                        <CheckCircle2 className="size-5" />
                      </div>
                      {activeGeneratingTypes.includes("quiz") ? (
                        <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 font-medium">
                          <Loader2 className="size-3 animate-spin" />
                          <span>Generating</span>
                        </span>
                      ) : quizResource && quizResource.status === "completed" ? (
                        <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                          {quizCount ? `${quizCount} Questions` : "Ready"}
                        </span>
                      ) : (
                        <span className="text-xs font-medium text-muted-foreground">
                          Not generated
                        </span>
                      )}
                    </div>
                    <h4 className="mt-3 text-base font-bold text-foreground group-hover:text-primary transition-colors">
                      Practice Quiz
                    </h4>
                    <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground line-clamp-2">
                      Multiple-choice tests with detailed rationales and persistent scoring.
                    </p>
                  </div>
                  <div className="mt-4 flex items-center gap-1.5 text-xs font-semibold text-primary">
                    <span>Take Quiz</span>
                    <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-1" />
                  </div>
                </div>

                {/* 5. AI Teacher Talk */}
                <div
                  onClick={() => setActiveTab("ai-talk")}
                  className="group cursor-pointer flex flex-col justify-between rounded-2xl border border-border/80 bg-card/60 p-5 hover:border-primary/50 hover:bg-card/90 transition-all shadow-xs"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <div className="flex size-10 items-center justify-center rounded-xl bg-brand-soft text-primary">
                        <Sparkles className="size-5" />
                      </div>
                      <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                        Interactive Tutor
                      </span>
                    </div>
                    <h4 className="mt-3 text-base font-bold text-foreground group-hover:text-primary transition-colors">
                      AI Teacher Talk
                    </h4>
                    <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground line-clamp-2">
                      Grounded voice and chat conversations in English or Hindi to clear doubts.
                    </p>
                  </div>
                  <div className="mt-4 flex items-center gap-1.5 text-xs font-semibold text-primary">
                    <span>Talk to Teacher</span>
                    <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-1" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* 1. NOTES TAB */}
        {/* ========================================================= */}
        {activeTab === "notes" && (
          <div className="mx-auto w-full max-w-4xl pb-28 pt-6 text-foreground">
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
                isGenerating={
                  loadingResources ||
                  activeGeneratingTypes.includes("notes") ||
                  activeGeneratingTypes.includes("summary") ||
                  !!(isRegenerating.notes || isRegenerating.summary)
                }
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
                documentId={document.id}
                questionsResource={questionsResource}
                getToken={getToken}
                isGenerating={
                  loadingResources ||
                  activeGeneratingTypes.includes("questions") ||
                  !!isRegenerating.questions
                }
                isRegenerating={!!isRegenerating.questions}
                onRegenerate={() => handleRegenerate("questions")}
                onOpenGenerateDialog={() => setGenerateDialogOpen(true)}
                onProgressUpdated={refreshStudyProgress}
                availableTopics={availableTopics}
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
                  onAction={() => setActiveTab("home")}
                  actionLabel="Back to Workspace Home"
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
                documentId={document.id}
                flashcardsResource={flashcardsResource}
                getToken={getToken}
                isGenerating={
                  loadingResources ||
                  activeGeneratingTypes.includes("flashcards") ||
                  !!isRegenerating.flashcards
                }
                isRegenerating={!!isRegenerating.flashcards}
                onRegenerate={() => handleRegenerate("flashcards")}
                onOpenGenerateDialog={() => setGenerateDialogOpen(true)}
                onProgressUpdated={refreshStudyProgress}
                availableTopics={availableTopics}
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
                  onAction={() => setActiveTab("home")}
                  actionLabel="Back to Workspace Home"
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
                isGenerating={
                  loadingResources ||
                  activeGeneratingTypes.includes("quiz") ||
                  !!isRegenerating.quiz
                }
                isRegenerating={!!isRegenerating.quiz}
                onRegenerate={() => handleRegenerate("quiz")}
                onOpenGenerateDialog={() => setGenerateDialogOpen(true)}
                onProgressUpdated={refreshStudyProgress}
                availableTopics={availableTopics}
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
                  onAction={() => setActiveTab("home")}
                  actionLabel="Back to Workspace Home"
                />
              </div>
            )}
          </div>
        )}

        {/* ========================================================= */}
        {/* 5. AI TALK TAB (Phase 9 Grounded AI Teacher) */}
        {/* ========================================================= */}
        {activeTab === "ai-talk" && (
          <div className="flex-1 flex flex-col min-h-0 h-full max-h-full pt-1 pb-1 overflow-hidden no-scrollbar">
            {isExtractionDone ? (
              <TeacherChatView
                document={docState}
                documentTitle={displayTitle}
                getToken={getToken}
                onOpenPdf={(page) => handleOpenPdf(page)}
              />
            ) : (
              <div className="pb-28 pt-6">
                <WorkspaceEmptyState
                  icon={Sparkles}
                  title="Extraction Pending"
                  phaseBadge="PDF Extraction Required"
                  description="Wait for text extraction to finish before starting your interactive session with the AI Teacher."
                  features={[
                    "Selectable text extraction in progress",
                    "AI Teacher will unlock once extraction completes",
                  ]}
                  onAction={() => setActiveTab("home")}
                  actionLabel="Back to Workspace Home"
                />
              </div>
            )}
          </div>
        )}
      </main>

      {/* Floating Bottom Navigation */}
      <WorkspaceNavigation
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      {/* Search Across Materials Modal */}
      <StudySearchDialog
        open={searchDialogOpen}
        onOpenChange={setSearchDialogOpen}
        documentId={document.id}
        getToken={getToken}
        onSelectResult={handleSelectSearchResult}
      />

      {/* Generate Study Materials Dialog */}
      <GenerateStudyDialog
        open={generateDialogOpen}
        onOpenChange={setGenerateDialogOpen}
        documentId={document.id}
        documentTitle={docState.original_filename}
        generationStatus={generationStatus}
        getToken={getToken}
        onGenerationStarted={handleGenerationStarted}
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
                src={
                  pdfTargetPage
                    ? `${pdfBlobUrl}#page=${pdfTargetPage}&toolbar=1`
                    : `${pdfBlobUrl}#toolbar=1`
                }
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
