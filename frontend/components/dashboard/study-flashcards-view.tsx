"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
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
  FlashcardsContent,
  StudyResourceResponse,
} from "@/lib/api";

interface StudyFlashcardsViewProps {
  flashcardsResource: StudyResourceResponse | null;
  isRegenerating: boolean;
  onRegenerate: () => void;
  onOpenGenerateDialog: () => void;
}

export function StudyFlashcardsView({
  flashcardsResource,
  isRegenerating,
  onRegenerate,
  onOpenGenerateDialog,
}: StudyFlashcardsViewProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);

  const flashcardsData: FlashcardsContent | null =
    (flashcardsResource?.content as unknown as FlashcardsContent) || null;
  const cards: FlashcardItem[] = flashcardsData?.cards || [];
  const totalCards = cards.length;

  const currentCard: FlashcardItem | undefined = cards[currentIndex];

  const handleNext = useCallback(() => {
    if (currentIndex < totalCards - 1) {
      setIsFlipped(false);
      setCurrentIndex((prev) => prev + 1);
    }
  }, [currentIndex, totalCards]);

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) {
      setIsFlipped(false);
      setCurrentIndex((prev) => prev - 1);
    }
  }, [currentIndex]);

  const handleFlip = useCallback(() => {
    setIsFlipped((prev) => !prev);
  }, []);

  // Keyboard navigation: Left/Right arrows and Space/Enter to flip
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
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
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleFlip, handleNext, handlePrev]);

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
          Generate double-sided active recall flashcards to memorize definitions, key formulas, and principles with spaced repetition.
        </p>
        <Button onClick={onOpenGenerateDialog} className="mt-6 gap-2">
          <Sparkles className="size-4" />
          <span>Generate Study Materials</span>
        </Button>
      </div>
    );
  }

  if (totalCards === 0) {
    return (
      <div className="p-8 text-center text-xs text-muted-foreground">
        No flashcards found in this resource.
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center pb-28 pt-4">
      {/* Top Header & Actions */}
      <div className="mb-6 flex w-full items-center justify-between border-b pb-4">
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

      {/* Progress & Card Index */}
      <div className="mb-3 flex w-full items-center justify-between text-xs text-muted-foreground">
        <span className="font-semibold text-foreground">
          Card {currentIndex + 1} of {totalCards}
        </span>
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
          style={{ width: `${((currentIndex + 1) / totalCards) * 100}%` }}
        />
      </div>

      {/* 3D Flashcard Surface */}
      <div
        onClick={handleFlip}
        role="button"
        tabIndex={0}
        aria-label="Flip flashcard"
        className="group relative flex min-h-[300px] w-full cursor-pointer flex-col justify-between rounded-3xl border bg-card p-8 shadow-md transition-all hover:border-primary/40 hover:shadow-lg sm:min-h-[340px]"
      >
        <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-muted-foreground">
          <span>{isFlipped ? "Answer" : "Question / Concept"}</span>
          <span className="flex items-center gap-1 text-[11px] font-normal text-muted-foreground/80 group-hover:text-primary">
            <RotateCw className="size-3" />
            <span>Click to flip</span>
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

        <div className="text-center text-[11px] text-muted-foreground/60">
          Press Space to flip · Use Arrow keys to navigate
        </div>
      </div>

      {/* Bottom Navigation Controls */}
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
          <span>{isFlipped ? "Show Question" : "Reveal Answer"}</span>
        </Button>

        <Button
          variant="outline"
          size="icon"
          onClick={handleNext}
          disabled={currentIndex === totalCards - 1}
          className="size-11 rounded-full"
          aria-label="Next card"
        >
          <ChevronRight className="size-5" />
        </Button>
      </div>
    </div>
  );
}
