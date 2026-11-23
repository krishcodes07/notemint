"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Filter,
  Layers,
  Loader2,
  Plus,
  RefreshCw,
  RotateCw,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AggregatedFlashcardItem,
  FlashcardProgressItem,
  FlashcardsContent,
  StudyGenerationBatchResponse,
  StudyResourceResponse,
  getAggregatedFlashcards,
  getFlashcardProgress,
  getGenerationBatches,
  updateFlashcardProgress,
} from "@/lib/api";
import { GenerateMoreDialog } from "@/components/dashboard/generate-more-dialog";
import { FormattedMathText } from "@/components/ui/formatted-math-text";

interface StudyFlashcardsViewProps {
  documentId: string;
  flashcardsResource: StudyResourceResponse | null;
  getToken: () => Promise<string | null>;
  isGenerating?: boolean;
  isRegenerating: boolean;
  onRegenerate: () => void;
  onOpenGenerateDialog: () => void;
  onProgressUpdated?: () => void;
  availableTopics?: string[];
}

type ReviewFilter = "all" | "not_studied" | "needs_practice" | "mastered";

const MASTERY_LABELS: Record<number, { label: string; color: string }> = {
  0: { label: "Not studied", color: "bg-muted text-muted-foreground border-border" },
  1: { label: "Learning", color: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25" },
  2: { label: "Familiar", color: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/25" },
  3: { label: "Mastered", color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25" },
};

export function StudyFlashcardsView({
  documentId,
  flashcardsResource,
  getToken,
  isGenerating = false,
  isRegenerating,
  onRegenerate,
  onOpenGenerateDialog,
  onProgressUpdated,
  availableTopics = [],
}: StudyFlashcardsViewProps) {
  // Aggregated cards state (original + all active batches)
  const [cards, setCards] = useState<AggregatedFlashcardItem[]>([]);
  const [batches, setBatches] = useState<StudyGenerationBatchResponse[]>([]);

  // Generate More Dialog state
  const [generateMoreOpen, setGenerateMoreOpen] = useState(false);
  const [activeBatch, setActiveBatch] = useState<StudyGenerationBatchResponse | null>(null);
  const [batchBanner, setBatchBanner] = useState<{
    type: "info" | "success" | "error";
    message: string;
  } | null>(null);

  // Card view state
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [activeFilter, setActiveFilter] = useState<ReviewFilter>("all");

  const isCardsGenerating =
    isGenerating ||
    isRegenerating ||
    flashcardsResource?.status === "generating" ||
    flashcardsResource?.status === "pending" ||
    activeBatch?.status === "pending" ||
    activeBatch?.status === "generating";
  const [difficultyFilter, setDifficultyFilter] = useState<string>("all");
  const [batchFilter, setBatchFilter] = useState<string>("all");
  const [progressMap, setProgressMap] = useState<Record<string, FlashcardProgressItem>>({});
  const [savingCardId, setSavingCardId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Triggers to reload cards and progress
  const [reloadCardsTrigger, setReloadCardsTrigger] = useState(0);
  const [reloadProgressTrigger, setReloadProgressTrigger] = useState(0);

  const loadAggregated = useCallback(() => {
    setReloadCardsTrigger((prev) => prev + 1);
  }, []);

  const loadProgress = useCallback(() => {
    setReloadProgressTrigger((prev) => prev + 1);
  }, []);

  // Load aggregated flashcards
  useEffect(() => {
    let isCancelled = false;
    async function fetchCards() {
      if (!flashcardsResource?.id) return;
      try {
        const agg = await getAggregatedFlashcards(documentId, getToken);
        if (!isCancelled) {
          setCards(agg.cards);
          setBatches(agg.batches);
        }
      } catch {
        // Fallback to base resource content
        const baseContent = (flashcardsResource?.content as unknown as FlashcardsContent) || null;
        if (!isCancelled && baseContent?.cards) {
          setCards(
            baseContent.cards.map((c) => ({
              ...c,
              resource_id: flashcardsResource.id,
              batch_id: null,
              batch_label: "Original",
            }))
          );
        }
      }
    }

    fetchCards();
    return () => {
      isCancelled = true;
    };
  }, [documentId, flashcardsResource, getToken, reloadCardsTrigger]);

  // Fetch saved progress for all cards in this document
  useEffect(() => {
    let isCancelled = false;
    async function fetchProgress() {
      if (!flashcardsResource?.id) return;
      try {
        const resp = await getFlashcardProgress(documentId, getToken);
        if (!isCancelled) {
          const map: Record<string, FlashcardProgressItem> = {};
          for (const item of resp.items) {
            map[item.card_id] = item;
          }
          setProgressMap(map);
        }
      } catch {
        // Silently preserve offline/empty progress
      }
    }

    fetchProgress();
    return () => {
      isCancelled = true;
    };
  }, [documentId, flashcardsResource?.id, getToken, reloadProgressTrigger]);

  // Check for active batches on mount and poll while generating
  useEffect(() => {
    let isCancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;

    async function checkBatches() {
      try {
        const res = await getGenerationBatches(documentId, getToken, "flashcards");
        if (isCancelled) return;
        const pending = res.items.find(
          (b) => b.status === "pending" || b.status === "generating"
        );
        if (pending) {
          setActiveBatch(pending);
          setBatchBanner({
            type: "info",
            message: `Generating ${pending.requested_count} ${pending.difficulty} flashcards in the background...`,
          });
          pollTimer = setTimeout(checkBatches, 2500);
        } else if (activeBatch) {
          // Previously running batch finished
          const completed = res.items.find((b) => b.id === activeBatch.id);
          if (completed && completed.status === "completed") {
            setBatchBanner({
              type: "success",
              message: `Successfully generated ${completed.generated_count} new flashcards! Appended to your deck.`,
            });
            loadAggregated();
            loadProgress();
            if (onProgressUpdated) onProgressUpdated();
          } else if (completed && completed.status === "failed") {
            setBatchBanner({
              type: "error",
              message: completed.error_message || "Generation failed. Please try again.",
            });
          }
          setActiveBatch(null);
        }
      } catch {
        // Silently ignore polling errors
      }
    }

    checkBatches();

    return () => {
      isCancelled = true;
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, [documentId, getToken, activeBatch, loadAggregated, loadProgress, onProgressUpdated]);

  const handleGenerationStarted = (batch: StudyGenerationBatchResponse) => {
    setActiveBatch(batch);
    setBatchBanner({
      type: "info",
      message: `Generating ${batch.requested_count} ${batch.difficulty} flashcards in the background...`,
    });
  };

  // Filter cards based on review status, difficulty, and batch
  const filteredCards = cards.filter((card) => {
    // Review filter
    const prog = progressMap[card.id];
    const level = prog ? prog.mastery_level : 0;
    if (activeFilter === "not_studied" && level !== 0) return false;
    if (activeFilter === "needs_practice" && level !== 1 && level !== 2) return false;
    if (activeFilter === "mastered" && level !== 3) return false;

    // Difficulty filter
    if (difficultyFilter !== "all") {
      if ((card.difficulty || "medium").toLowerCase() !== difficultyFilter) return false;
    }

    // Batch filter
    if (batchFilter !== "all") {
      if (batchFilter === "original") {
        if (card.batch_id != null) return false;
      } else {
        if (card.batch_id !== batchFilter) return false;
      }
    }

    return true;
  });

  const totalFiltered = filteredCards.length;
  const safeIndex = currentIndex < totalFiltered ? currentIndex : 0;
  const currentCard: AggregatedFlashcardItem | undefined = filteredCards[safeIndex];
  const currentProgress: FlashcardProgressItem | undefined = currentCard
    ? progressMap[currentCard.id]
    : undefined;

  const currentMastery = currentProgress ? currentProgress.mastery_level : 0;

  const handleSelectFilter = (filter: ReviewFilter) => {
    setActiveFilter(filter);
    setCurrentIndex(0);
    setIsFlipped(false);
  };

  const handleSelectDifficulty = (diff: string) => {
    setDifficultyFilter(diff);
    setCurrentIndex(0);
    setIsFlipped(false);
  };

  const handleSelectBatch = (bId: string) => {
    setBatchFilter(bId);
    setCurrentIndex(0);
    setIsFlipped(false);
  };

  // Stats across ALL cards currently in workspace
  const totalCardsCount = cards.length;
  const reviewedCardsCount = Object.values(progressMap).filter(
    (p) => p.review_count > 0
  ).length;
  const masteredCardsCount = Object.values(progressMap).filter(
    (p) => p.mastery_level === 3
  ).length;
  const needsPracticeCount = Object.values(progressMap).filter(
    (p) => p.mastery_level === 1 || p.mastery_level === 2
  ).length;

  const handleNext = useCallback(() => {
    if (currentIndex < totalFiltered - 1) {
      setIsFlipped(false);
      setCurrentIndex((prev) => prev + 1);
    }
  }, [currentIndex, totalFiltered]);

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) {
      setIsFlipped(false);
      setCurrentIndex((prev) => prev - 1);
    }
  }, [currentIndex]);

  const handleFlip = useCallback(() => {
    setIsFlipped((prev) => !prev);
  }, []);

  // Review action: Again, Learning, Know It
  const handleReviewAction = useCallback(
    async (result: "known" | "learning" | "again") => {
      if (!currentCard || !flashcardsResource) return;
      const cardId = currentCard.id;
      const targetResourceId = currentCard.resource_id || flashcardsResource.id;
      const prevProgress = progressMap[cardId];

      // Optimistic update
      let newLevel = 0;
      const curr = prevProgress ? prevProgress.mastery_level : 0;
      if (result === "known") newLevel = Math.min(curr + 1, 3);
      else if (result === "again") newLevel = Math.max(0, curr - 1);
      else newLevel = 1;

      const optimisticItem: FlashcardProgressItem = {
        id: prevProgress?.id || `opt-${cardId}`,
        clerk_user_id: "",
        document_id: documentId,
        resource_id: targetResourceId,
        card_id: cardId,
        mastery_level: newLevel,
        review_count: (prevProgress?.review_count || 0) + 1,
        correct_count: (prevProgress?.correct_count || 0) + (result === "known" ? 1 : 0),
        incorrect_count: (prevProgress?.incorrect_count || 0) + (result === "again" ? 1 : 0),
        last_reviewed_at: new Date().toISOString(),
        created_at: prevProgress?.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      setProgressMap((prev) => ({ ...prev, [cardId]: optimisticItem }));
      setSavingCardId(cardId);
      setActionError(null);

      // Advance to next card
      if (currentIndex < totalFiltered - 1) {
        setIsFlipped(false);
        setCurrentIndex((prev) => prev + 1);
      } else {
        setIsFlipped(false);
      }

      try {
        const saved = await updateFlashcardProgress(
          documentId,
          targetResourceId,
          cardId,
          result,
          getToken
        );
        setProgressMap((prev) => ({ ...prev, [cardId]: saved }));
        if (onProgressUpdated) onProgressUpdated();
      } catch (err: unknown) {
        // Rollback
        if (prevProgress) {
          setProgressMap((prev) => ({ ...prev, [cardId]: prevProgress }));
        } else {
          setProgressMap((prev) => {
            const next = { ...prev };
            delete next[cardId];
            return next;
          });
        }
        const msg = err instanceof Error ? err.message : "Failed to record mastery";
        setActionError(msg);
      } finally {
        setSavingCardId(null);
      }
    },
    [
      currentCard,
      flashcardsResource,
      progressMap,
      currentIndex,
      totalFiltered,
      documentId,
      getToken,
      onProgressUpdated,
    ]
  );

  // Keyboard navigation & rating shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      if (e.code === "Space" || e.code === "Enter") {
        e.preventDefault();
        handleFlip();
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        handleNext();
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        handlePrev();
      } else if (isFlipped) {
        if (e.key === "1") {
          e.preventDefault();
          handleReviewAction("again");
        } else if (e.key === "2") {
          e.preventDefault();
          handleReviewAction("learning");
        } else if (e.key === "3") {
          e.preventDefault();
          handleReviewAction("known");
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleFlip, handleNext, handlePrev, isFlipped, handleReviewAction]);

  if (!flashcardsResource && cards.length === 0 && !isCardsGenerating) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed p-12 text-center">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-brand-soft text-primary">
          <Layers className="size-7" />
        </div>
        <h3 className="mt-4 text-lg font-bold text-foreground">
          No Flashcards Generated Yet
        </h3>
        <p className="mt-1.5 max-w-md text-xs leading-relaxed text-muted-foreground">
          Generate double-sided active recall flashcards to memorize definitions, key formulas, and principles with persistent mastery tracking.
        </p>
        <Button onClick={onOpenGenerateDialog} className="mt-6 gap-2">
          <Sparkles className="size-4" />
          <span>Generate Study Materials</span>
        </Button>
      </div>
    );
  }

  const masteryInfo = MASTERY_LABELS[currentMastery] || MASTERY_LABELS[0];

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center pb-28 pt-4">
      {/* Top Header & Actions */}
      <div className="mb-6 flex w-full flex-wrap items-center justify-between gap-3 border-b pb-4">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-primary">
            <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Layers className="size-4" />
            </div>
            <span>Active-Recall Flashcards ({totalCardsCount})</span>
          </div>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Study Flashcards
          </h2>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => setGenerateMoreOpen(true)}
            className="h-9 gap-1.5 rounded-xl text-xs sm:text-sm font-semibold"
          >
            <Plus className="size-4" />
            <span>Generate More</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={onRegenerate}
            disabled={isRegenerating}
            className="h-9 gap-1.5 rounded-xl text-xs sm:text-sm"
          >
            {isRegenerating ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
            <span>Regenerate</span>
          </Button>
        </div>
      </div>

      {/* Background Generation Status Banner */}
      {batchBanner && (
        <div
          className={`mb-6 flex w-full items-center justify-between gap-3 rounded-2xl border p-4 text-sm ${
            batchBanner.type === "info"
              ? "border-amber-500/25 bg-amber-500/5 text-amber-600 dark:text-amber-400"
              : batchBanner.type === "success"
              ? "border-emerald-500/25 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400"
              : "border-destructive/25 bg-destructive/5 text-destructive"
          }`}
        >
          <div className="flex items-center gap-2.5">
            {batchBanner.type === "info" && <Loader2 className="size-4 animate-spin shrink-0" />}
            {batchBanner.type === "success" && <CheckCircle2 className="size-4 shrink-0" />}
            {batchBanner.type === "error" && <AlertCircle className="size-4 shrink-0" />}
            <span>{batchBanner.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setBatchBanner(null)}
            className="ml-2 text-xs font-semibold hover:opacity-80"
          >
            ✕
          </button>
        </div>
      )}

      {/* Persistent Mastery Stats Ribbon */}
      <div className="mb-6 grid w-full grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="flex flex-col rounded-2xl border bg-card/60 p-4 text-center shadow-xs">
          <span className="text-xs font-semibold text-muted-foreground">
            Total Cards
          </span>
          <span className="mt-1 text-xl sm:text-2xl font-bold text-foreground">
            {totalCardsCount}
          </span>
        </div>

        <div className="flex flex-col rounded-2xl border bg-card/60 p-4 text-center shadow-xs">
          <span className="text-xs font-semibold text-muted-foreground">
            Reviewed
          </span>
          <span className="mt-1 text-xl sm:text-2xl font-bold text-primary">
            {reviewedCardsCount}
          </span>
        </div>

        <div className="flex flex-col rounded-2xl border bg-card/60 p-4 text-center shadow-xs">
          <span className="text-xs font-semibold text-muted-foreground">
            Mastered
          </span>
          <span className="mt-1 text-xl sm:text-2xl font-bold text-emerald-600 dark:text-emerald-400">
            {masteredCardsCount}
          </span>
        </div>

        <div className="flex flex-col rounded-2xl border bg-card/60 p-4 text-center shadow-xs">
          <span className="text-xs font-semibold text-muted-foreground">
            Needs Practice
          </span>
          <span className="mt-1 text-xl sm:text-2xl font-bold text-amber-600 dark:text-amber-400">
            {needsPracticeCount}
          </span>
        </div>
      </div>

      {/* Review Filters & Batch Selection */}
      <div className="mb-5 flex w-full flex-col gap-3">
        {/* Review mastery filters */}
        <div className="flex w-full items-center justify-between gap-2 overflow-x-auto pb-1 text-xs">
          <div className="flex items-center gap-1.5 text-muted-foreground shrink-0">
            <Filter className="size-3.5" />
            <span className="font-medium">Mastery:</span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => handleSelectFilter("all")}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                activeFilter === "all"
                  ? "bg-primary text-primary-foreground shadow-2xs font-semibold"
                  : "border bg-muted/30 text-muted-foreground hover:text-foreground"
              }`}
            >
              All ({totalCardsCount})
            </button>

            <button
              type="button"
              onClick={() => handleSelectFilter("not_studied")}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                activeFilter === "not_studied"
                  ? "bg-primary text-primary-foreground shadow-2xs font-semibold"
                  : "border bg-muted/30 text-muted-foreground hover:text-foreground"
              }`}
            >
              Not studied ({totalCardsCount - reviewedCardsCount})
            </button>

            <button
              type="button"
              onClick={() => handleSelectFilter("needs_practice")}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                activeFilter === "needs_practice"
                  ? "bg-primary text-primary-foreground shadow-2xs font-semibold"
                  : "border bg-muted/30 text-muted-foreground hover:text-foreground"
              }`}
            >
              Needs practice ({needsPracticeCount})
            </button>

            <button
              type="button"
              onClick={() => handleSelectFilter("mastered")}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                activeFilter === "mastered"
                  ? "bg-primary text-primary-foreground shadow-2xs font-semibold"
                  : "border bg-muted/30 text-muted-foreground hover:text-foreground"
              }`}
            >
              Mastered ({masteredCardsCount})
            </button>
          </div>
        </div>

        {/* Secondary filters: Difficulty & Batch */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t text-xs">
          {/* Difficulty pill selectors */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-medium text-muted-foreground">Difficulty:</span>
            {["all", "easy", "medium", "hard"].map((diff) => (
              <button
                key={diff}
                type="button"
                onClick={() => handleSelectDifficulty(diff)}
                className={`rounded-md px-2 py-0.5 text-[11px] capitalize transition-colors ${
                  difficultyFilter === diff
                    ? "bg-foreground text-background font-semibold"
                    : "border bg-muted/20 text-muted-foreground hover:text-foreground"
                }`}
              >
                {diff}
              </button>
            ))}
          </div>

          {/* Batches selector if custom batches exist */}
          {batches.length > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-medium text-muted-foreground">Batch:</span>
              <select
                value={batchFilter}
                onChange={(e) => handleSelectBatch(e.target.value)}
                className="h-6 rounded-md border bg-card px-2 text-[11px] text-foreground focus:outline-hidden"
              >
                <option value="all">All Batches</option>
                <option value="original">Original Set</option>
                {batches.map((b, idx) => (
                  <option key={b.id} value={b.id}>
                    Batch {idx + 1} ({b.difficulty.charAt(0).toUpperCase() + b.difficulty.slice(1)})
                    {b.topic ? ` - ${b.topic}` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Empty Filter State */}
      {filteredCards.length === 0 ? (
        isCardsGenerating ? (
          <div className="my-8 flex w-full flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border/80 py-20 text-center animate-in fade-in duration-300">
            <Loader2 className="size-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="my-8 flex w-full flex-col items-center justify-center rounded-2xl border border-dashed p-8 text-center">
            <CheckCircle2 className="size-8 text-primary" />
            <h4 className="mt-2 text-sm font-bold text-foreground">
              No cards in this filter
            </h4>
            <p className="mt-1 text-xs text-muted-foreground">
              {activeFilter === "mastered"
                ? "Keep reviewing cards and mark them as 'Know It' to build mastery."
                : "Switch to 'All' or adjust difficulty to continue practicing."}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setActiveFilter("all");
                setDifficultyFilter("all");
                setBatchFilter("all");
              }}
              className="mt-4 text-xs"
            >
              Reset Filters
            </Button>
          </div>
        )
      ) : (
        <>
          {/* Progress & Card Index */}
          <div className="mb-2.5 flex w-full items-center justify-between text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-foreground">
                Card {safeIndex + 1} of {totalFiltered}
              </span>
              <Badge
                variant="outline"
                className={`text-[10px] font-medium capitalize ${masteryInfo.color}`}
              >
                {masteryInfo.label}
              </Badge>
              {currentCard?.batch_label && (
                <Badge variant="outline" className="text-[10px] font-normal border-primary/20 text-primary">
                  {currentCard.batch_label}
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-2">
              {currentCard?.difficulty && (
                <Badge
                  className={`text-[10px] capitalize ${
                    currentCard.difficulty === "easy"
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                      : currentCard.difficulty === "medium"
                      ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
                      : "bg-destructive/10 text-destructive border-destructive/20"
                  }`}
                >
                  {currentCard.difficulty}
                </Badge>
              )}
              {currentCard?.source_pages && currentCard.source_pages.length > 0 && (
                <span className="font-mono text-[10px]">
                  Page {currentCard.source_pages.join(", ")}
                </span>
              )}
            </div>
          </div>

          {/* Progress Bar */}
          <div className="mb-6 h-1 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${((safeIndex + 1) / totalFiltered) * 100}%` }}
            />
          </div>

          {/* 3D Flashcard Surface */}
          <div
            onClick={handleFlip}
            role="button"
            tabIndex={0}
            aria-label="Flip flashcard"
            className="group relative flex min-h-[320px] w-full cursor-pointer flex-col justify-between rounded-3xl border bg-card p-8 shadow-xs transition-all duration-300 hover:border-primary/40 hover:shadow-md sm:min-h-[360px]"
          >
            <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
              <span className="flex items-center gap-1.5 text-primary">
                <BookOpen className="size-4" />
                <span>{isFlipped ? "Answer / Explanation" : "Question / Concept"}</span>
              </span>
              <span className="flex items-center gap-1 text-xs text-muted-foreground/80 group-hover:text-primary transition-colors">
                <RotateCw className="size-3.5" />
                <span>Space to flip</span>
              </span>
            </div>

            <div className="my-auto py-8 text-center px-4">
              <div
                className={`transition-opacity duration-200 leading-relaxed ${
                  isFlipped
                    ? "text-lg sm:text-xl md:text-2xl font-normal text-foreground"
                    : "text-xl sm:text-2xl md:text-3xl font-bold text-foreground"
                }`}
              >
                <FormattedMathText
                  text={isFlipped ? (currentCard?.back ?? "") : (currentCard?.front ?? "")}
                />
              </div>
            </div>

            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Reviewed: {currentProgress?.review_count || 0} times</span>
              <span className="hidden sm:inline">Space to flip · Arrow keys to navigate</span>
            </div>
          </div>

          {/* Mastery Review Controls (Revealed after flip) */}
          {isFlipped ? (
            <div className="mt-6 flex w-full flex-col items-center gap-2.5">
              <div className="flex w-full items-center justify-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleReviewAction("again");
                  }}
                  disabled={savingCardId === currentCard?.id}
                  className="flex-1 max-w-[140px] h-11 gap-2 rounded-xl border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive text-sm font-semibold"
                >
                  <span>Again</span>
                  <span className="text-xs opacity-60 font-mono">[1]</span>
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleReviewAction("learning");
                  }}
                  disabled={savingCardId === currentCard?.id}
                  className="flex-1 max-w-[140px] h-11 gap-2 rounded-xl border-amber-500/30 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 text-sm font-semibold"
                >
                  <span>Learning</span>
                  <span className="text-xs opacity-60 font-mono">[2]</span>
                </Button>

                <Button
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleReviewAction("known");
                  }}
                  disabled={savingCardId === currentCard?.id}
                  className="flex-1 max-w-[140px] h-11 gap-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-semibold"
                >
                  <CheckCircle2 className="size-4" />
                  <span>Know It</span>
                  <span className="text-xs opacity-80 font-mono">[3]</span>
                </Button>
              </div>
              <span className="text-xs text-muted-foreground">
                Rate your recall to advance to the next card
              </span>
            </div>
          ) : (
            <div className="mt-8 flex items-center justify-center gap-4">
              <Button
                variant="outline"
                size="icon"
                onClick={handlePrev}
                disabled={safeIndex === 0}
                className="size-11 rounded-full"
                aria-label="Previous card"
              >
                <ChevronLeft className="size-5" />
              </Button>

              <Button
                onClick={handleFlip}
                className="h-11 min-w-[140px] gap-2 rounded-full px-6 font-semibold"
              >
                <RotateCw className="size-4" />
                <span>Reveal Answer</span>
              </Button>

              <Button
                variant="outline"
                size="icon"
                onClick={handleNext}
                disabled={safeIndex === totalFiltered - 1}
                className="size-11 rounded-full"
                aria-label="Next card"
              >
                <ChevronRight className="size-5" />
              </Button>
            </div>
          )}

          {actionError && (
            <div className="mt-4 flex items-center gap-2 text-xs text-destructive">
              <AlertCircle className="size-3.5" />
              <span>{actionError}</span>
            </div>
          )}
        </>
      )}

      {/* Generate More Modal */}
      <GenerateMoreDialog
        open={generateMoreOpen}
        onOpenChange={setGenerateMoreOpen}
        documentId={documentId}
        resourceType="flashcards"
        availableTopics={availableTopics}
        getToken={getToken}
        onBatchCreated={handleGenerationStarted}
      />
    </div>
  );
}
