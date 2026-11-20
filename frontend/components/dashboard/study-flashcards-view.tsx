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
  RefreshCw,
  RotateCw,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  FlashcardItem,
  FlashcardProgressItem,
  FlashcardsContent,
  StudyResourceResponse,
  getFlashcardProgress,
  updateFlashcardProgress,
} from "@/lib/api";

interface StudyFlashcardsViewProps {
  documentId: string;
  flashcardsResource: StudyResourceResponse | null;
  getToken: () => Promise<string | null>;
  isRegenerating: boolean;
  onRegenerate: () => void;
  onOpenGenerateDialog: () => void;
  onProgressUpdated?: () => void;
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
  isRegenerating,
  onRegenerate,
  onOpenGenerateDialog,
  onProgressUpdated,
}: StudyFlashcardsViewProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [activeFilter, setActiveFilter] = useState<ReviewFilter>("all");
  const [progressMap, setProgressMap] = useState<Record<string, FlashcardProgressItem>>({});
  const [savingCardId, setSavingCardId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const flashcardsData: FlashcardsContent | null =
    (flashcardsResource?.content as unknown as FlashcardsContent) || null;
  const allCards: FlashcardItem[] = flashcardsData?.cards || [];

  // Fetch saved progress for active flashcards
  useEffect(() => {
    let isCancelled = false;
    async function loadProgress() {
      if (!flashcardsResource?.id) return;
      try {
        const resp = await getFlashcardProgress(
          documentId,
          getToken,
          flashcardsResource.id
        );
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

    loadProgress();
    return () => {
      isCancelled = true;
    };
  }, [documentId, flashcardsResource?.id, getToken]);

  // Filtered cards list
  const filteredCards = allCards.filter((card) => {
    const prog = progressMap[card.id];
    const level = prog ? prog.mastery_level : 0;
    if (activeFilter === "not_studied") return level === 0;
    if (activeFilter === "needs_practice") return level === 1 || level === 2;
    if (activeFilter === "mastered") return level === 3;
    return true;
  });

  const totalFiltered = filteredCards.length;
  const safeIndex = currentIndex < totalFiltered ? currentIndex : 0;
  const currentCard: FlashcardItem | undefined = filteredCards[safeIndex];
  const currentProgress: FlashcardProgressItem | undefined = currentCard
    ? progressMap[currentCard.id]
    : undefined;

  const currentMastery = currentProgress ? currentProgress.mastery_level : 0;

  const handleSelectFilter = (filter: ReviewFilter) => {
    setActiveFilter(filter);
    setCurrentIndex(0);
    setIsFlipped(false);
  };

  // Stats across ALL cards
  const totalCardsCount = allCards.length;
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
        resource_id: flashcardsResource.id,
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
          flashcardsResource.id,
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

  if (!flashcardsResource) {
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

  if (allCards.length === 0) {
    return (
      <div className="p-8 text-center text-xs text-muted-foreground">
        No flashcards found in this resource.
      </div>
    );
  }

  const masteryInfo = MASTERY_LABELS[currentMastery] || MASTERY_LABELS[0];

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center pb-28 pt-4">
      {/* Top Header & Actions */}
      <div className="mb-6 flex w-full flex-wrap items-center justify-between gap-3 border-b pb-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary">
            <Layers className="size-3.5" />
            <span>Active Recall Flashcards · v{flashcardsResource.version}</span>
          </div>
          <h2 className="text-xl font-bold tracking-tight text-foreground">
            {flashcardsData?.title || "Flashcards"}
          </h2>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={onRegenerate}
          disabled={isRegenerating}
          className="h-8 gap-1.5 text-xs"
        >
          {isRegenerating ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <RefreshCw className="size-3.5" />
          )}
          <span>Regenerate</span>
        </Button>
      </div>

      {flashcardsResource.status === "generating" && (
        <div className="mb-6 flex w-full items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-xs text-amber-600 dark:text-amber-400">
          <Loader2 className="size-4 animate-spin shrink-0" />
          <span>Synthesizing fresh flashcards with Kilo Gateway...</span>
        </div>
      )}

      {/* Persistent Mastery Stats Ribbon */}
      <div className="mb-5 grid w-full grid-cols-2 gap-2.5 sm:grid-cols-4">
        <div className="flex flex-col rounded-xl border bg-card/60 p-3 text-center shadow-2xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Total Cards
          </span>
          <span className="mt-1 text-lg font-bold text-foreground">
            {totalCardsCount}
          </span>
        </div>

        <div className="flex flex-col rounded-xl border bg-card/60 p-3 text-center shadow-2xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Reviewed
          </span>
          <span className="mt-1 text-lg font-bold text-primary">
            {reviewedCardsCount}
          </span>
        </div>

        <div className="flex flex-col rounded-xl border bg-card/60 p-3 text-center shadow-2xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Mastered
          </span>
          <span className="mt-1 text-lg font-bold text-emerald-600 dark:text-emerald-400">
            {masteredCardsCount}
          </span>
        </div>

        <div className="flex flex-col rounded-xl border bg-card/60 p-3 text-center shadow-2xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Needs Practice
          </span>
          <span className="mt-1 text-lg font-bold text-amber-600 dark:text-amber-400">
            {needsPracticeCount}
          </span>
        </div>
      </div>

      {/* Review Filters */}
      <div className="mb-5 flex w-full items-center justify-between gap-2 overflow-x-auto pb-1 text-xs">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Filter className="size-3.5" />
          <span className="font-medium">Filter:</span>
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

      {/* Empty Filter State */}
      {filteredCards.length === 0 ? (
        <div className="my-8 flex w-full flex-col items-center justify-center rounded-2xl border border-dashed p-8 text-center">
          <CheckCircle2 className="size-8 text-primary" />
          <h4 className="mt-2 text-sm font-bold text-foreground">
            No cards in this filter
          </h4>
          <p className="mt-1 text-xs text-muted-foreground">
            {activeFilter === "mastered"
              ? "Keep reviewing cards and mark them as 'Know It' to build mastery."
              : "Switch to 'All' or another category to continue practicing."}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setActiveFilter("all")}
            className="mt-4 text-xs"
          >
            View All Cards
          </Button>
        </div>
      ) : (
        <>
          {/* Progress & Card Index */}
          <div className="mb-2.5 flex w-full items-center justify-between text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-foreground">
                Card {currentIndex + 1} of {totalFiltered}
              </span>
              <Badge
                variant="outline"
                className={`text-[10px] font-medium capitalize ${masteryInfo.color}`}
              >
                {masteryInfo.label}
              </Badge>
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
              style={{ width: `${((currentIndex + 1) / totalFiltered) * 100}%` }}
            />
          </div>

          {/* 3D Flashcard Surface */}
          <div
            onClick={handleFlip}
            role="button"
            tabIndex={0}
            aria-label="Flip flashcard"
            className="group relative flex min-h-[300px] w-full cursor-pointer flex-col justify-between rounded-3xl border bg-card p-8 shadow-sm transition-all hover:border-primary/40 hover:shadow-md sm:min-h-[340px]"
          >
            <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <BookOpen className="size-3.5 text-primary" />
                <span>{isFlipped ? "Answer" : "Question / Concept"}</span>
              </span>
              <span className="flex items-center gap-1 text-[11px] font-normal text-muted-foreground/80 group-hover:text-primary">
                <RotateCw className="size-3" />
                <span>Click or Space to flip</span>
              </span>
            </div>

            <div className="my-auto py-6 text-center">
              <p
                className={`transition-opacity duration-200 leading-relaxed ${
                  isFlipped
                    ? "text-base sm:text-lg font-medium text-foreground"
                    : "text-lg sm:text-2xl font-bold text-foreground"
                }`}
              >
                {isFlipped ? currentCard?.back : currentCard?.front}
              </p>
            </div>

            <div className="flex items-center justify-between text-[11px] text-muted-foreground/70">
              <span>Reviews: {currentProgress?.review_count || 0}</span>
              <span>Press Space to flip · Arrow keys to navigate</span>
            </div>
          </div>

          {/* Mastery Review Controls (Revealed after flip) */}
          {isFlipped ? (
            <div className="mt-6 flex w-full flex-col items-center gap-2">
              <div className="flex w-full items-center justify-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleReviewAction("again");
                  }}
                  disabled={savingCardId === currentCard?.id}
                  className="flex-1 max-w-[130px] h-10 gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive text-xs font-semibold"
                >
                  <span>Again</span>
                  <span className="hidden text-[10px] opacity-60 sm:inline">[1]</span>
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleReviewAction("learning");
                  }}
                  disabled={savingCardId === currentCard?.id}
                  className="flex-1 max-w-[130px] h-10 gap-1.5 border-amber-500/30 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 text-xs font-semibold"
                >
                  <span>Learning</span>
                  <span className="hidden text-[10px] opacity-60 sm:inline">[2]</span>
                </Button>

                <Button
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleReviewAction("known");
                  }}
                  disabled={savingCardId === currentCard?.id}
                  className="flex-1 max-w-[130px] h-10 gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700 text-xs font-semibold"
                >
                  <CheckCircle2 className="size-3.5" />
                  <span>Know It</span>
                  <span className="hidden text-[10px] opacity-70 sm:inline">[3]</span>
                </Button>
              </div>
              <span className="text-[11px] text-muted-foreground/80">
                Grade your recall to update persistent mastery
              </span>
            </div>
          ) : (
            <div className="mt-8 flex items-center justify-center gap-4">
              <Button
                variant="outline"
                size="icon"
                onClick={handlePrev}
                disabled={currentIndex === 0}
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
                disabled={currentIndex === totalFiltered - 1}
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
    </div>
  );
}
