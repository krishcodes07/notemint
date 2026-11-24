"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  Award,
  CheckCircle2,
  Clock,
  Eye,
  History,
  Layers,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  Sparkles,
  XCircle,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AggregatedQuizQuestionItem,
  QuestionGradeResult,
  QuizAttemptDetail,
  QuizAttemptSummary,
  QuizContent,
  QuizPracticeSetSummary,
  QuizSubmissionResponse,
  StudyGenerationBatchResponse,
  StudyResourceResponse,
  getAggregatedQuiz,
  getGenerationBatches,
  getQuizAttempt,
  getQuizAttempts,
  submitPracticeSetQuiz,
} from "@/lib/api";
import { GenerateMoreDialog } from "@/components/dashboard/generate-more-dialog";
import { FormattedMathText } from "@/components/ui/formatted-math-text";

interface StudyQuizViewProps {
  documentId: string;
  quizResource: StudyResourceResponse | null;
  getToken: () => Promise<string | null>;
  isGenerating?: boolean;
  isRegenerating: boolean;
  onRegenerate: () => void;
  onOpenGenerateDialog: () => void;
  onProgressUpdated?: () => void;
  availableTopics?: string[];
}

export function StudyQuizView({
  documentId,
  quizResource,
  getToken,
  isGenerating = false,
  isRegenerating,
  onRegenerate,
  onOpenGenerateDialog,
  onProgressUpdated,
  availableTopics = [],
}: StudyQuizViewProps) {
  // Aggregated practice sets & questions
  const [practiceSets, setPracticeSets] = useState<QuizPracticeSetSummary[]>([]);
  const [selectedSetId, setSelectedSetId] = useState<string>("all");
  const [allQuestions, setAllQuestions] = useState<AggregatedQuizQuestionItem[]>([]);
  const [batches, setBatches] = useState<StudyGenerationBatchResponse[]>([]);

  // Generate More Dialog state
  const [generateMoreOpen, setGenerateMoreOpen] = useState(false);
  const [activeBatch, setActiveBatch] = useState<StudyGenerationBatchResponse | null>(null);
  const [batchBanner, setBatchBanner] = useState<{
    type: "info" | "success" | "error";
    message: string;
  } | null>(null);

  // Quiz Taking state
  // Selected options map: { [questionId]: optionIndex }
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, number>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [gradingResult, setGradingResult] = useState<QuizSubmissionResponse | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Filters
  const [difficultyFilter, setDifficultyFilter] = useState<string>("all");
  const [reviewFilter, setReviewFilter] = useState<"all" | "incorrect">("all");

  const isQuizGenerating =
    isGenerating ||
    isRegenerating ||
    quizResource?.status === "generating" ||
    quizResource?.status === "pending" ||
    activeBatch?.status === "pending" ||
    activeBatch?.status === "generating";

  // Attempt History state
  const [attempts, setAttempts] = useState<QuizAttemptSummary[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [viewingPastAttempt, setViewingPastAttempt] = useState<QuizAttemptDetail | null>(null);
  const [loadingPastAttempt, setLoadingPastAttempt] = useState(false);

  // Triggers to reload quiz data and attempts
  const [reloadQuizTrigger, setReloadQuizTrigger] = useState(0);
  const [reloadHistoryTrigger, setReloadHistoryTrigger] = useState(0);

  const loadAggregated = useCallback(() => {
    setReloadQuizTrigger((prev) => prev + 1);
  }, []);

  const loadHistory = useCallback(() => {
    setReloadHistoryTrigger((prev) => prev + 1);
  }, []);

  // Load aggregated quiz practice sets and questions
  useEffect(() => {
    let isCancelled = false;
    async function fetchQuiz() {
      if (!quizResource?.id) return;
      try {
        const agg = await getAggregatedQuiz(documentId, getToken);
        if (!isCancelled) {
          setPracticeSets(agg.practice_sets);
          setAllQuestions(agg.questions);
          setBatches(agg.batches);

          // Default select the first practice set if not set or invalid
          if (agg.practice_sets.length > 0) {
            setSelectedSetId((prev) => {
              const exists = agg.practice_sets.some((s) => s.set_id === prev);
              return exists ? prev : agg.practice_sets[0].set_id;
            });
          }
        }
      } catch {
        // Fallback to base resource content
        const baseContent = (quizResource?.content as unknown as QuizContent) || null;
        if (!isCancelled && baseContent?.questions) {
          const mapped = baseContent.questions.map((q) => ({
            ...q,
            resource_id: quizResource.id,
            batch_id: null,
            batch_label: "Original",
          }));
          setAllQuestions(mapped);
          setPracticeSets([
            {
              set_id: quizResource.id,
              title: `Original Quiz (${mapped.length} Questions)`,
              question_count: mapped.length,
              difficulty: "mixed",
              topic: null,
              resource_id: quizResource.id,
              batch_id: null,
              created_at: quizResource.created_at,
            },
          ]);
          setSelectedSetId(quizResource.id);
        }
      }
    }

    fetchQuiz();
    return () => {
      isCancelled = true;
    };
  }, [documentId, quizResource, getToken, reloadQuizTrigger]);

  // Load attempt history on mount or resource change
  useEffect(() => {
    let isCancelled = false;
    async function fetchHistory() {
      if (!quizResource?.id) return;
      try {
        const list = await getQuizAttempts(documentId, getToken);
        if (!isCancelled) {
          setAttempts(list);
        }
      } catch {
        // Silently preserve empty history
      }
    }

    fetchHistory();
    return () => {
      isCancelled = true;
    };
  }, [documentId, quizResource?.id, getToken, reloadHistoryTrigger]);

  // Active generation batch polling
  useEffect(() => {
    let isCancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;

    async function checkBatches() {
      try {
        const res = await getGenerationBatches(documentId, getToken, "quiz");
        if (isCancelled) return;
        const pending = res.items.find(
          (b) => b.status === "pending" || b.status === "generating"
        );
        if (pending) {
          setActiveBatch(pending);
          setBatchBanner({
            type: "info",
            message: `Generating ${pending.requested_count} ${pending.difficulty} quiz questions in the background...`,
          });
          pollTimer = setTimeout(checkBatches, 2500);
        } else if (activeBatch) {
          const completed = res.items.find((b) => b.id === activeBatch.id);
          if (completed && completed.status === "completed") {
            setBatchBanner({
              type: "success",
              message: `Successfully generated ${completed.generated_count} new quiz questions! Added to practice sets.`,
            });
            loadAggregated();
            loadHistory();
            if (onProgressUpdated) onProgressUpdated();
          } else if (completed && completed.status === "failed") {
            setBatchBanner({
              type: "error",
              message: completed.error_message || "Quiz generation failed. Please try again.",
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
  }, [documentId, getToken, activeBatch, loadAggregated, loadHistory, onProgressUpdated]);

  const handleGenerationStarted = (batch: StudyGenerationBatchResponse) => {
    setActiveBatch(batch);
    setBatchBanner({
      type: "info",
      message: `Generating ${batch.requested_count} ${batch.difficulty} quiz questions in the background...`,
    });
  };

  // Practice set switching
  const handleSelectPracticeSet = (setId: string) => {
    setSelectedSetId(setId);
    setSelectedAnswers({});
    setGradingResult(null);
    setViewingPastAttempt(null);
    setSubmitError(null);
    setReviewFilter("all");
    setDifficultyFilter("all");
  };

  // Current set's questions
  const setQuestions = allQuestions.filter((q) => {
    if (selectedSetId === "all") return true;
    return q.resource_id === selectedSetId;
  });

  // Filtered questions based on difficulty & post-grading review filter
  const displayedQuestions = setQuestions.filter((q) => {
    if (difficultyFilter !== "all") {
      if ((q.difficulty || "medium").toLowerCase() !== difficultyFilter) return false;
    }
    if (!gradingResult || reviewFilter === "all") return true;
    const graded = gradingResult.results.find((r) => r.question_id === q.id);
    return graded ? !graded.is_correct : true;
  });

  const totalQuestionsInSet = setQuestions.length;
  const answeredCount = Object.keys(selectedAnswers).filter((qId) =>
    setQuestions.some((q) => q.id === qId)
  ).length;

  const handleSelectOption = (questionId: string, optionIndex: number) => {
    if (gradingResult || viewingPastAttempt) return; // Locked once graded or when viewing history
    setSelectedAnswers((prev) => ({
      ...prev,
      [questionId]: optionIndex,
    }));
  };

  const handleSubmitQuiz = async () => {
    if (totalQuestionsInSet === 0) return;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const result = await submitPracticeSetQuiz(
        documentId,
        selectedSetId,
        selectedAnswers,
        getToken
      );
      setGradingResult(result);
      setViewingPastAttempt(null);

      // Refresh attempts list
      await loadHistory();

      if (onProgressUpdated) onProgressUpdated();
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to grade quiz. Please try again.";
      setSubmitError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRetakeQuiz = () => {
    setSelectedAnswers({});
    setGradingResult(null);
    setViewingPastAttempt(null);
    setSubmitError(null);
    setReviewFilter("all");
  };

  const handleViewHistoricalAttempt = async (attemptId: string) => {
    setLoadingPastAttempt(true);
    try {
      const detail = await getQuizAttempt(documentId, attemptId, getToken);
      setViewingPastAttempt(detail);
      setGradingResult({
        resource_id: detail.resource_id,
        total_questions: detail.total_questions,
        answered_questions: Object.keys(detail.submitted_answers).length,
        correct_answers: detail.correct_answers,
        score_percentage: detail.score_percentage,
        results: detail.graded_result as QuestionGradeResult[],
        attempt_id: detail.id,
        completed_at: detail.completed_at,
      });
      setSelectedAnswers(detail.submitted_answers);
      setHistoryOpen(false);
    } catch {
      alert("Failed to load historical attempt details.");
    } finally {
      setLoadingPastAttempt(false);
    }
  };

  if (!quizResource && allQuestions.length === 0 && !isQuizGenerating) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed p-12 text-center">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-brand-soft text-primary">
          <Zap className="size-7" />
        </div>
        <h3 className="mt-4 text-lg font-bold text-foreground">
          No Practice Quiz Generated Yet
        </h3>
        <p className="mt-1.5 max-w-md text-xs leading-relaxed text-muted-foreground">
          Generate multiple-choice practice quizzes with 4 options per question, server-side grading, and in-depth explanations.
        </p>
        <Button onClick={onOpenGenerateDialog} className="mt-6 gap-2">
          <Sparkles className="size-4" />
          <span>Generate Study Materials</span>
        </Button>
      </div>
    );
  }

  const currentSet = practiceSets.find((s) => s.set_id === selectedSetId);

  return (
    <article className="mx-auto w-full max-w-3xl pb-28 pt-4 text-foreground">
      {/* Quiz Top Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b pb-4">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-primary">
            <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Zap className="size-4" />
            </div>
            <span>Practice Quiz ({allQuestions.length} Questions)</span>
          </div>
          <h2 className="mt-2 text-xl font-bold tracking-tight text-foreground sm:text-3xl">
            {currentSet ? currentSet.title : "Practice Quiz"}
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <Button
            size="sm"
            onClick={() => setGenerateMoreOpen(true)}
            className="h-8 sm:h-9 gap-1 sm:gap-1.5 rounded-xl text-xs sm:text-sm font-semibold px-2.5 sm:px-3"
          >
            <Plus className="size-3.5 sm:size-4" />
            <span className="hidden sm:inline">Generate More</span>
            <span className="sm:hidden">More</span>
          </Button>

          {/* History Toggle */}
          {attempts.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setHistoryOpen((prev) => !prev)}
              className="h-8 sm:h-9 gap-1 sm:gap-1.5 rounded-xl text-xs sm:text-sm px-2.5 sm:px-3"
            >
              <History className="size-3.5 text-primary" />
              <span>History ({attempts.length})</span>
            </Button>
          )}

          {gradingResult ? (
            <Button
              variant="outline"
              size="sm"
              onClick={handleRetakeQuiz}
              className="h-8 sm:h-9 gap-1 sm:gap-1.5 rounded-xl text-xs sm:text-sm font-medium px-2.5 sm:px-3"
            >
              <RotateCcw className="size-3.5" />
              <span>Retake</span>
            </Button>
          ) : null}

          <Button
            variant="outline"
            size="sm"
            onClick={onRegenerate}
            disabled={isRegenerating}
            className="h-8 sm:h-9 gap-1 sm:gap-1.5 rounded-xl text-xs sm:text-sm px-2.5 sm:px-3"
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

      {/* Background Generation Status Banner */}
      {batchBanner && (
        <div
          className={`mb-6 flex w-full items-center justify-between gap-3 rounded-xl border p-4 text-xs ${
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

      {quizResource?.status === "generating" && !batchBanner && (
        <div className="mb-6 flex items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-xs text-amber-600 dark:text-amber-400">
          <Loader2 className="size-4 animate-spin shrink-0" />
          <span>Generating fresh MCQ quiz questions with Kilo Gateway...</span>
        </div>
      )}

      {/* Practice Set Selector Ribbon (When multiple sets exist) */}
      {practiceSets.length > 1 && (
        <div className="mb-6 rounded-2xl border bg-card/60 p-4 shadow-2xs">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
              <Layers className="size-4 text-primary" />
              <span>Practice Set:</span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {practiceSets.map((s) => (
                <button
                  key={s.set_id}
                  type="button"
                  onClick={() => handleSelectPracticeSet(s.set_id)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                    selectedSetId === s.set_id
                      ? "bg-primary text-primary-foreground font-semibold shadow-2xs"
                      : "border bg-muted/30 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {s.title}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Historical Attempts Drawer */}
      {historyOpen && attempts.length > 0 && (
        <div className="mb-6 rounded-2xl border bg-card/90 p-5 shadow-sm">
          <div className="flex items-center justify-between border-b pb-3">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-foreground">
              <History className="size-4 text-primary" />
              <span>Past Quiz Attempts</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setHistoryOpen(false)}
              className="h-7 text-xs text-muted-foreground"
            >
              Close
            </Button>
          </div>

          <div className="mt-3 flex flex-col gap-2 max-h-60 overflow-y-auto pr-1">
            {attempts.map((att, idx) => {
              const isViewing = viewingPastAttempt?.id === att.id;
              const completedDate = new Date(att.completed_at).toLocaleDateString(
                undefined,
                {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                }
              );

              return (
                <div
                  key={att.id}
                  className={`flex items-center justify-between rounded-xl border p-3 text-xs transition-colors ${
                    isViewing
                      ? "border-primary bg-primary/5 font-medium"
                      : "border-border/60 bg-background hover:bg-muted/40"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-muted-foreground font-semibold">
                      #{attempts.length - idx}
                    </span>
                    <div className="flex flex-col">
                      <span className="font-bold text-foreground">
                        {att.score_percentage}% Score ({att.correct_answers}/
                        {att.total_questions} correct)
                      </span>
                      <span className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                        <Clock className="size-2.5" />
                        {completedDate}
                      </span>
                    </div>
                  </div>

                  <Button
                    variant={isViewing ? "default" : "outline"}
                    size="sm"
                    onClick={() => handleViewHistoricalAttempt(att.id)}
                    disabled={loadingPastAttempt}
                    className="h-7 gap-1 text-[11px]"
                  >
                    <Eye className="size-3" />
                    <span>{isViewing ? "Viewing" : "Review"}</span>
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Viewing Historical Banner */}
      {viewingPastAttempt && (
        <div className="mb-6 flex items-center justify-between rounded-xl border border-primary/20 bg-primary/5 px-4 py-2.5 text-xs text-foreground">
          <div className="flex items-center gap-2">
            <Clock className="size-3.5 text-primary" />
            <span>
              Viewing past attempt from{" "}
              {new Date(viewingPastAttempt.completed_at).toLocaleString()}
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRetakeQuiz}
            className="h-7 text-xs text-primary hover:underline"
          >
            Start Fresh Attempt
          </Button>
        </div>
      )}

      {/* 1. SCORE BANNER (When Graded) */}
      {gradingResult && (
        <div className="mb-8 rounded-2xl border border-primary/30 bg-brand-soft/20 p-6 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div
                className={`flex size-14 shrink-0 items-center justify-center rounded-2xl ${
                  gradingResult.score_percentage >= 70
                    ? "bg-primary text-primary-foreground"
                    : gradingResult.score_percentage >= 50
                    ? "bg-amber-500 text-white"
                    : "bg-destructive text-destructive-foreground"
                }`}
              >
                <Award className="size-7" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-foreground">
                  Quiz Completed: {gradingResult.score_percentage}%
                </h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  You answered{" "}
                  <strong className="text-foreground">
                    {gradingResult.correct_answers}
                  </strong>{" "}
                  out of{" "}
                  <strong className="text-foreground">
                    {gradingResult.total_questions}
                  </strong>{" "}
                  questions correctly. Review your answers and explanations below.
                </p>
              </div>
            </div>

            <Button
              onClick={handleRetakeQuiz}
              className="gap-2 shrink-0 self-start sm:self-center"
            >
              <RotateCcw className="size-4" />
              <span>Retake Quiz</span>
            </Button>
          </div>

          {/* Post-quiz Review Filter */}
          <div className="mt-5 flex items-center gap-2 border-t border-border/60 pt-4 text-xs">
            <span className="text-muted-foreground font-semibold">Review:</span>
            <button
              type="button"
              onClick={() => setReviewFilter("all")}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                reviewFilter === "all"
                  ? "bg-primary text-primary-foreground font-semibold"
                  : "border bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              All Questions ({totalQuestionsInSet})
            </button>
            <button
              type="button"
              onClick={() => setReviewFilter("incorrect")}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                reviewFilter === "incorrect"
                  ? "bg-destructive text-destructive-foreground font-semibold"
                  : "border bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              Incorrect Only (
              {gradingResult.total_questions - gradingResult.correct_answers})
            </button>
          </div>
        </div>
      )}

      {/* Pre-quiz Filters (Difficulty) */}
      <div className="mb-5 flex items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-medium text-muted-foreground">Filter Difficulty:</span>
          {["all", "easy", "medium", "hard"].map((diff) => (
            <button
              key={diff}
              type="button"
              onClick={() => setDifficultyFilter(diff)}
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

        <span className="text-[11px] text-muted-foreground font-mono">
          Showing {displayedQuestions.length} of {totalQuestionsInSet} questions
        </span>
      </div>

      {/* 2. QUESTIONS LIST */}
      <div className="flex flex-col gap-6">
        {displayedQuestions.length === 0 ? (
          isQuizGenerating ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border/80 py-20 text-center animate-in fade-in duration-300">
              <Loader2 className="size-8 animate-spin text-primary" />
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed p-8 text-center text-xs text-muted-foreground">
              No questions found for the selected filter.
            </div>
          )
        ) : (
          displayedQuestions.map((q, idx) => {
          const qId = q.id;
          const userSelectedOption = selectedAnswers[qId];

          // Lookup graded result for this question if submitted
          const gradedQ: QuestionGradeResult | undefined =
            gradingResult?.results.find((r) => r.question_id === qId);

          const itemKey = `${q.resource_id || "quiz"}_${qId}_${idx}`;

          return (
            <div
              key={itemKey}
              className={`rounded-2xl border p-4 sm:p-6 shadow-xs transition-colors ${
                gradedQ
                  ? gradedQ.is_correct
                    ? "border-emerald-500/30 bg-emerald-500/5"
                    : "border-destructive/30 bg-destructive/5"
                  : "bg-card/50 hover:bg-card/80"
              }`}
            >
              {/* Question Header */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5 sm:gap-3 min-w-0">
                  <span className="flex size-7 sm:size-8 shrink-0 items-center justify-center rounded-xl border bg-muted/60 font-mono text-xs font-bold text-foreground">
                    {idx + 1}
                  </span>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-foreground text-sm sm:text-lg leading-snug">
                      <FormattedMathText text={q.question} />
                    </h3>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {q.difficulty && (
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
                      )}
                      {q.batch_label && (
                        <Badge variant="outline" className="text-xs font-normal border-primary/20 text-primary">
                          {q.batch_label}
                        </Badge>
                      )}
                      {q.source_pages && q.source_pages.length > 0 && (
                        <span className="text-xs font-mono text-muted-foreground">
                          Page {q.source_pages.join(", ")}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {gradedQ && (
                  <Badge
                    className={`shrink-0 text-xs px-2.5 py-1 ${
                      gradedQ.is_correct
                        ? "bg-emerald-500 text-white"
                        : "bg-destructive text-white"
                    }`}
                  >
                    {gradedQ.is_correct ? (
                      <span className="flex items-center gap-1.5">
                        <CheckCircle2 className="size-3.5" />
                        Correct
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5">
                        <XCircle className="size-3.5" />
                        Incorrect
                      </span>
                    )}
                  </Badge>
                )}
              </div>

              {/* 4 Options Grid */}
              <div className="mt-4 sm:mt-5 grid grid-cols-1 gap-2.5 sm:gap-3 sm:grid-cols-2">
                {q.options.map((optText, optIdx) => {
                  const isSelected = userSelectedOption === optIdx;

                  let optionStyle =
                    "border-border hover:bg-muted/40 cursor-pointer bg-card/60";

                  if (gradingResult && gradedQ) {
                    const isCorrectOption = gradedQ.correct_option_index === optIdx;
                    if (isCorrectOption) {
                      optionStyle =
                        "border-emerald-500 bg-emerald-500/15 font-semibold text-emerald-700 dark:text-emerald-300";
                    } else if (isSelected && !gradedQ.is_correct) {
                      optionStyle =
                        "border-destructive bg-destructive/15 text-destructive line-through";
                    } else {
                      optionStyle = "border-border/60 opacity-60";
                    }
                  } else if (isSelected) {
                    optionStyle =
                      "border-primary bg-primary/10 font-semibold text-primary shadow-xs ring-1 ring-primary/30";
                  }

                  return (
                    <div
                      key={optIdx}
                      onClick={() => handleSelectOption(qId, optIdx)}
                      className={`flex items-center gap-3 rounded-xl border p-3 sm:p-4 text-xs sm:text-base transition-all ${optionStyle}`}
                    >
                      <span
                        className={`flex size-6 sm:size-7 shrink-0 items-center justify-center rounded-lg border font-mono text-xs font-bold ${
                          isSelected
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-muted-foreground/30 text-muted-foreground"
                        }`}
                      >
                        {String.fromCharCode(65 + optIdx)}
                      </span>
                      <span className="leading-snug break-words min-w-0">
                        <FormattedMathText text={optText} />
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Explanation (Revealed post-grading) */}
              {gradedQ && (
                <div className="mt-5 rounded-xl border border-primary/20 bg-primary/5 dark:bg-primary/10 p-5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                      <CheckCircle2 className="size-4" />
                      <span>Explanation & Concepts</span>
                    </div>
                    {gradedQ.source_pages && gradedQ.source_pages.length > 0 && (
                      <span className="text-xs font-mono text-muted-foreground">
                        Revise: Page {gradedQ.source_pages.join(", ")}
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-sm sm:text-base leading-relaxed text-foreground/90">
                    <FormattedMathText text={gradedQ.explanation} />
                  </p>
                </div>
              )}
            </div>
          );
        }))}
      </div>

      {submitError && (
        <div className="mt-6 flex items-center gap-2 rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-xs text-destructive">
          <AlertCircle className="size-4 shrink-0" />
          <span>{submitError}</span>
        </div>
      )}

      {/* Submission Sticky/Bottom Bar */}
      {!gradingResult && (
        <div className="mt-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-2xl border bg-card p-4 sm:p-5 shadow-sm">
          <div className="text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">
              {answeredCount} of {totalQuestionsInSet}
            </span>{" "}
            questions answered
            {answeredCount < totalQuestionsInSet && (
              <span className="ml-2 text-amber-600 dark:text-amber-400">
                ({totalQuestionsInSet - answeredCount} remaining)
              </span>
            )}
          </div>

          <Button
            onClick={handleSubmitQuiz}
            disabled={answeredCount === 0 || isSubmitting}
            className="w-full sm:w-auto gap-2 font-semibold"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                <span>Evaluating Answers...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="size-4" />
                <span>Submit Quiz for Grading</span>
              </>
            )}
          </Button>
        </div>
      )}

      {/* Generate More Modal */}
      <GenerateMoreDialog
        open={generateMoreOpen}
        onOpenChange={setGenerateMoreOpen}
        documentId={documentId}
        resourceType="quiz"
        availableTopics={availableTopics}
        getToken={getToken}
        onBatchCreated={handleGenerationStarted}
      />
    </article>
  );
}
