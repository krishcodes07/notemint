"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Bookmark,
  BookmarkCheck,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileQuestion,
  Filter,
  HelpCircle,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AggregatedQuestionItem,
  QuestionBookmarkResponse,
  QuestionsContent,
  StudyGenerationBatchResponse,
  StudyResourceResponse,
  createQuestionBookmark,
  deleteQuestionBookmark,
  getAggregatedQuestions,
  getGenerationBatches,
  getQuestionBookmarks,
} from "@/lib/api";
import { GenerateMoreDialog } from "@/components/dashboard/generate-more-dialog";
import { FormattedMathText } from "@/components/ui/formatted-math-text";

interface StudyQuestionsViewProps {
  documentId: string;
  questionsResource: StudyResourceResponse | null;
  getToken: () => Promise<string | null>;
  isGenerating?: boolean;
  isRegenerating: boolean;
  onRegenerate: () => void;
  onOpenGenerateDialog: () => void;
  onProgressUpdated?: () => void;
  availableTopics?: string[];
}

export function StudyQuestionsView({
  documentId,
  questionsResource,
  getToken,
  isGenerating = false,
  isRegenerating,
  onRegenerate,
  onOpenGenerateDialog,
  onProgressUpdated,
  availableTopics = [],
}: StudyQuestionsViewProps) {
  // Aggregated questions state (combining original + all batches)
  const [questions, setQuestions] = useState<AggregatedQuestionItem[]>([]);
  const [, setBatches] = useState<StudyGenerationBatchResponse[]>([]);

  // Generate More Dialog state
  const [generateMoreOpen, setGenerateMoreOpen] = useState(false);
  const [activeBatch, setActiveBatch] = useState<StudyGenerationBatchResponse | null>(null);
  const [batchBanner, setBatchBanner] = useState<{
    type: "info" | "success" | "error";
    message: string;
  } | null>(null);

  // State tracking expanded questions
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});

  // Bookmarks state: map question_id -> bookmark object
  const [bookmarksMap, setBookmarksMap] = useState<Record<string, QuestionBookmarkResponse>>({});
  const [, setLoadingBookmarks] = useState(false);
  const [togglingBookmarkId, setTogglingBookmarkId] = useState<string | null>(null);

  const isQuestionsGenerating =
    isGenerating ||
    isRegenerating ||
    questionsResource?.status === "generating" ||
    questionsResource?.status === "pending" ||
    activeBatch?.status === "pending" ||
    activeBatch?.status === "generating";

  // Filters
  const [bookmarkOnlyFilter, setBookmarkOnlyFilter] = useState(false);
  const [difficultyFilter, setDifficultyFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [batchFilter, setBatchFilter] = useState<string>("all");

  // Trigger state to refetch aggregated questions
  const [reloadTrigger, setReloadTrigger] = useState(0);
  const loadAggregated = useCallback(() => {
    setReloadTrigger((prev) => prev + 1);
  }, []);

  // Fetch aggregated questions from backend
  useEffect(() => {
    let isCancelled = false;
    async function fetchAggregated() {
      if (!questionsResource?.id) return;
      try {
        const agg = await getAggregatedQuestions(documentId, getToken);
        if (!isCancelled) {
          setQuestions(agg.questions);
          setBatches(agg.batches);
        }
      } catch {
        // Fallback to base resource content
        const baseContent = (questionsResource?.content as unknown as QuestionsContent) || null;
        if (!isCancelled && baseContent?.questions) {
          setQuestions(
            baseContent.questions.map((q) => ({
              ...q,
              important_points: q.important_points || [],
              resource_id: questionsResource.id,
              batch_id: null,
              batch_label: "Original",
            }))
          );
        }
      }
    }

    fetchAggregated();
    return () => {
      isCancelled = true;
    };
  }, [documentId, questionsResource, getToken, reloadTrigger]);

  // Load question bookmarks for document
  useEffect(() => {
    let isCancelled = false;
    async function loadBookmarks() {
      if (!questionsResource?.id) return;
      setLoadingBookmarks(true);
      try {
        const list = await getQuestionBookmarks(documentId, getToken);
        if (!isCancelled) {
          const map: Record<string, QuestionBookmarkResponse> = {};
          for (const b of list) {
            map[b.question_id] = b;
          }
          setBookmarksMap(map);
        }
      } catch {
        // Silently preserve empty bookmarks on error
      } finally {
        if (!isCancelled) setLoadingBookmarks(false);
      }
    }

    loadBookmarks();
    return () => {
      isCancelled = true;
    };
  }, [documentId, questionsResource?.id, getToken]);

  // Poll active generation batch until completion or failure
  useEffect(() => {
    if (!activeBatch || activeBatch.status === "completed" || activeBatch.status === "failed") {
      return;
    }

    let isCancelled = false;
    const timer = setInterval(async () => {
      try {
        const batchList = await getGenerationBatches(documentId, getToken, "questions");
        const current = batchList.items.find((b) => b.id === activeBatch.id);
        if (!current || isCancelled) return;

        if (current.status === "completed") {
          setActiveBatch(null);
          setBatchBanner({
            type: "success",
            message: `${current.generated_count} of ${current.requested_count} new questions added!`,
          });
          await loadAggregated();
          if (onProgressUpdated) onProgressUpdated();
        } else if (current.status === "failed") {
          setActiveBatch(null);
          setBatchBanner({
            type: "error",
            message: current.error_message || "Couldn't generate more questions. Try again.",
          });
        }
      } catch {
        // Silently retry next interval
      }
    }, 2500);

    return () => {
      isCancelled = true;
      clearInterval(timer);
    };
  }, [activeBatch, documentId, getToken, loadAggregated, onProgressUpdated]);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const handleExpandAll = () => {
    const allExpanded = filteredQuestions.every((q) => expandedIds[q.id]);
    const newState: Record<string, boolean> = { ...expandedIds };
    for (const q of filteredQuestions) {
      newState[q.id] = !allExpanded;
    }
    setExpandedIds(newState);
  };

  // Toggle bookmark
  const handleToggleBookmark = useCallback(
    async (q: AggregatedQuestionItem) => {
      const qId = q.id;
      const targetResourceId = q.resource_id || questionsResource?.id;
      if (!targetResourceId) return;

      const existingBookmark = bookmarksMap[qId];
      setTogglingBookmarkId(qId);

      if (existingBookmark) {
        // Optimistic remove
        setBookmarksMap((prev) => {
          const next = { ...prev };
          delete next[qId];
          return next;
        });

        try {
          await deleteQuestionBookmark(documentId, existingBookmark.id, getToken);
          if (onProgressUpdated) onProgressUpdated();
        } catch {
          // Revert
          setBookmarksMap((prev) => ({ ...prev, [qId]: existingBookmark }));
        } finally {
          setTogglingBookmarkId(null);
        }
      } else {
        // Optimistic add
        const tempBookmark: QuestionBookmarkResponse = {
          id: `temp-${qId}`,
          clerk_user_id: "",
          document_id: documentId,
          resource_id: targetResourceId,
          question_id: qId,
          created_at: new Date().toISOString(),
        };

        setBookmarksMap((prev) => ({ ...prev, [qId]: tempBookmark }));

        try {
          const created = await createQuestionBookmark(
            documentId,
            targetResourceId,
            qId,
            getToken
          );
          setBookmarksMap((prev) => ({ ...prev, [qId]: created }));
          if (onProgressUpdated) onProgressUpdated();
        } catch {
          // Revert
          setBookmarksMap((prev) => {
            const next = { ...prev };
            delete next[qId];
            return next;
          });
        } finally {
          setTogglingBookmarkId(null);
        }
      }
    },
    [bookmarksMap, documentId, questionsResource, getToken, onProgressUpdated]
  );

  // Filter questions
  const filteredQuestions = questions.filter((q) => {
    if (bookmarkOnlyFilter && !bookmarksMap[q.id]) {
      return false;
    }
    if (difficultyFilter !== "all" && q.difficulty !== difficultyFilter) {
      return false;
    }
    if (typeFilter !== "all" && q.answer_type !== typeFilter) {
      return false;
    }
    if (batchFilter !== "all" && q.batch_label !== batchFilter) {
      return false;
    }
    return true;
  });

  if (!questionsResource && !isQuestionsGenerating) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed p-12 text-center">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-brand-soft text-primary">
          <HelpCircle className="size-7" />
        </div>
        <h3 className="mt-4 text-lg font-bold text-foreground">
          No Important Questions Generated Yet
        </h3>
        <p className="mt-1.5 max-w-md text-xs leading-relaxed text-muted-foreground">
          Synthesize high-yield exam questions with model answers, bookmarks, and scoring points directly from your uploaded PDF.
        </p>
        <Button onClick={onOpenGenerateDialog} className="mt-6 gap-2">
          <Sparkles className="size-4" />
          <span>Generate Study Materials</span>
        </Button>
      </div>
    );
  }

  const allAreExpanded =
    filteredQuestions.length > 0 &&
    filteredQuestions.every((q) => expandedIds[q.id]);

  const bookmarkedTotal = Object.keys(bookmarksMap).length;
  const distinctBatches = Array.from(new Set(questions.map((q) => q.batch_label)));

  return (
    <article className="mx-auto w-full max-w-3xl pb-28 pt-4 text-foreground">
      {/* Top Header & Controls */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b pb-4">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-primary">
            <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <FileQuestion className="size-4" />
            </div>
            <span>Exam-Targeted Questions ({questions.length})</span>
          </div>
          <h2 className="mt-2 text-xl font-bold tracking-tight text-foreground sm:text-3xl">
            Important Questions & Answers
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {/* Generate More Button */}
          <Button
            size="sm"
            onClick={() => setGenerateMoreOpen(true)}
            className="h-8 sm:h-9 gap-1 sm:gap-1.5 rounded-xl text-xs sm:text-sm font-semibold px-2.5 sm:px-3"
          >
            <Plus className="size-3.5 sm:size-4" />
            <span className="hidden sm:inline">Generate More</span>
            <span className="sm:hidden">More</span>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={handleExpandAll}
            className="h-8 sm:h-9 rounded-xl text-xs sm:text-sm text-muted-foreground hover:text-foreground px-2 sm:px-3"
          >
            <span className="hidden sm:inline">{allAreExpanded ? "Collapse All" : "Reveal All Answers"}</span>
            <span className="sm:hidden">{allAreExpanded ? "Collapse" : "Reveal"}</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={onRegenerate}
            disabled={isRegenerating}
            className="h-8 sm:h-9 gap-1 sm:gap-1.5 rounded-xl text-xs sm:text-sm px-2.5 sm:px-3"
            title="Regenerate original questions"
          >
            {isRegenerating ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
            <span className="hidden sm:inline">Regenerate</span>
          </Button>
        </div>
      </div>

      {/* Generation Status Banner */}
      {activeBatch && (
        <div className="mb-6 flex items-center justify-between gap-3 rounded-xl border border-primary/25 bg-brand-soft p-3.5 text-xs text-primary shadow-2xs">
          <div className="flex items-center gap-2.5">
            <Loader2 className="size-4 animate-spin shrink-0 text-primary" />
            <span>
              Generating <strong>{activeBatch.requested_count}</strong> {activeBatch.difficulty} questions
              {activeBatch.topic ? ` on "${activeBatch.topic}"` : ""}...
            </span>
          </div>
          <span className="text-[11px] text-muted-foreground">Running in background</span>
        </div>
      )}

      {batchBanner && (
        <div
          className={`mb-6 flex items-center justify-between gap-3 rounded-xl border p-3.5 text-xs transition-all ${
            batchBanner.type === "success"
              ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
              : batchBanner.type === "error"
              ? "border-destructive/25 bg-destructive/10 text-destructive"
              : "border-primary/25 bg-brand-soft text-primary"
          }`}
        >
          <div className="flex items-center gap-2">
            {batchBanner.type === "success" && <CheckCircle2 className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />}
            <span>{batchBanner.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setBatchBanner(null)}
            className="text-[11px] font-medium opacity-80 hover:opacity-100 underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Filter Ribbon */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card/60 p-3.5 shadow-2xs">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground pr-2">
            <Filter className="size-3.5 text-primary" />
            <span className="font-semibold text-foreground">Filters:</span>
          </div>

          {/* Bookmarks Toggle */}
          <button
            type="button"
            onClick={() => setBookmarkOnlyFilter((prev) => !prev)}
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
              bookmarkOnlyFilter
                ? "border-primary bg-primary text-primary-foreground font-semibold shadow-2xs"
                : "border-border bg-background text-muted-foreground hover:text-foreground"
            }`}
          >
            <Bookmark className="size-3.5" />
            <span>Bookmarked ({bookmarkedTotal})</span>
          </button>

          {/* Difficulty Filter */}
          <div className="inline-flex rounded-lg border bg-muted/40 p-0.5 text-xs">
            {["all", "easy", "medium", "hard"].map((diff) => (
              <button
                key={diff}
                type="button"
                onClick={() => setDifficultyFilter(diff)}
                className={`rounded-md px-2 py-0.5 capitalize transition-colors ${
                  difficultyFilter === diff
                    ? "bg-background text-foreground font-medium shadow-2xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {diff}
              </button>
            ))}
          </div>

          {/* Answer Type Filter */}
          <div className="inline-flex rounded-lg border bg-muted/40 p-0.5 text-xs">
            {[
              { id: "all", label: "All types" },
              { id: "very_short", label: "Very short" },
              { id: "short", label: "Short" },
              { id: "long", label: "Long" },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTypeFilter(t.id)}
                className={`rounded-md px-2 py-0.5 transition-colors ${
                  typeFilter === t.id
                    ? "bg-background text-foreground font-medium shadow-2xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Batch Filter (if more than 1 batch) */}
          {distinctBatches.length > 1 && (
            <select
              value={batchFilter}
              onChange={(e) => setBatchFilter(e.target.value)}
              className="rounded-lg border border-border bg-background px-2 py-1 text-xs text-foreground shadow-2xs"
            >
              <option value="all">All Batches ({distinctBatches.length})</option>
              {distinctBatches.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          )}
        </div>

        <span className="text-xs text-muted-foreground">
          Showing {filteredQuestions.length} of {questions.length}
        </span>
      </div>

      {/* Questions List */}
      {filteredQuestions.length > 0 ? (
        <div className="flex flex-col gap-4">
          {filteredQuestions.map((q: AggregatedQuestionItem, idx: number) => {
            const isExpanded = !!expandedIds[q.id];
            const isBookmarked = !!bookmarksMap[q.id];
            const isToggling = togglingBookmarkId === q.id;
            const itemKey = `${q.resource_id || "questions"}_${q.id}_${idx}`;

            return (
              <div
                key={itemKey}
                className={`overflow-hidden rounded-2xl border transition-colors ${
                  isBookmarked
                    ? "border-primary/40 bg-card/90 shadow-xs"
                    : "border-border/80 bg-card/50 hover:bg-card/80"
                }`}
              >
                {/* Question Row */}
                <div
                  onClick={() => toggleExpand(q.id)}
                  className="flex cursor-pointer items-start justify-between gap-3 sm:gap-4 p-3.5 sm:p-5"
                >
                  <div className="flex items-start gap-2.5 sm:gap-3.5 flex-1 min-w-0">
                    <span className="flex size-6 sm:size-7 shrink-0 items-center justify-center rounded-lg border bg-muted/60 font-mono text-xs font-bold text-foreground mt-0.5">
                      {idx + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-foreground text-sm sm:text-lg leading-snug">
                        <FormattedMathText text={q.question} />
                      </h3>
                      <div className="mt-2.5 flex flex-wrap items-center gap-1.5 sm:gap-2">
                        <Badge
                          variant="secondary"
                          className="capitalize text-xs font-medium px-2 py-0.5"
                        >
                          {q.answer_type.replace("_", " ")}
                        </Badge>
                        <Badge
                          className={`text-xs capitalize px-2 py-0.5 ${
                            q.difficulty === "easy"
                              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                              : q.difficulty === "medium"
                              ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                              : "bg-destructive/10 text-destructive border border-destructive/20"
                          }`}
                        >
                          {q.difficulty}
                        </Badge>
                        {q.batch_label !== "Original" && (
                          <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                            {q.batch_label}
                          </span>
                        )}
                        {q.source_pages && q.source_pages.length > 0 && (
                          <Badge variant="secondary" className="text-[10.5px] font-mono px-2 py-0.5">
                            Page {q.source_pages.join(", ")}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {/* Bookmark Toggle Button */}
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleBookmark(q);
                      }}
                      disabled={isToggling}
                      title={isBookmarked ? "Remove Bookmark" : "Bookmark Question"}
                      className={`size-8 rounded-lg transition-colors ${
                        isBookmarked
                          ? "text-primary hover:text-primary/80"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                      aria-label={isBookmarked ? "Bookmarked" : "Not bookmarked"}
                    >
                      {isBookmarked ? (
                        <BookmarkCheck className="size-4 fill-primary" />
                      ) : (
                        <Bookmark className="size-4" />
                      )}
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      className="size-8 p-0 text-muted-foreground hover:text-foreground"
                    >
                      {isExpanded ? (
                        <ChevronUp className="size-4" />
                      ) : (
                        <ChevronDown className="size-4" />
                      )}
                    </Button>
                  </div>
                </div>

                {/* Collapsible Answer */}
                {isExpanded && (
                  <div className="border-t bg-muted/20 p-5 sm:p-6">
                    <div className="text-xs sm:text-sm font-semibold text-primary">
                      Model Answer
                    </div>
                    <p className="mt-2 text-base leading-relaxed text-foreground/90 font-normal">
                      <FormattedMathText text={q.answer} />
                    </p>

                    {q.important_points && q.important_points.length > 0 && (
                      <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 dark:bg-primary/10 p-4 sm:p-5">
                        <span className="text-xs sm:text-sm font-semibold text-primary">
                          Key Scoring Points:
                        </span>
                        <ul className="mt-2.5 flex flex-col gap-2">
                          {q.important_points.map((pt, pIdx) => (
                            <li
                              key={pIdx}
                              className="flex items-start gap-2 text-sm sm:text-base leading-relaxed text-foreground/90"
                            >
                              <span className="size-1.5 rounded-full bg-primary mt-2 shrink-0" />
                              <FormattedMathText text={pt} />
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : isQuestionsGenerating ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border/80 py-20 text-center animate-in fade-in duration-300">
          <Loader2 className="size-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed p-8 text-center text-xs text-muted-foreground">
          {bookmarkOnlyFilter
            ? "No bookmarked questions yet. Click the bookmark icon on any question to save it for revision."
            : "No questions match the current filter selection."}
        </div>
      )}

      {/* Generate More Dialog Modal */}
      <GenerateMoreDialog
        open={generateMoreOpen}
        onOpenChange={setGenerateMoreOpen}
        documentId={documentId}
        resourceType="questions"
        getToken={getToken}
        availableTopics={availableTopics}
        onBatchCreated={(batch) => {
          setActiveBatch(batch);
          setBatchBanner({
            type: "info",
            message: `Generating ${batch.requested_count} ${batch.difficulty} questions in background...`,
          });
        }}
      />
    </article>
  );
}
