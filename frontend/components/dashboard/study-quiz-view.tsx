"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
  Award,
  CheckCircle2,
  Clock,
  Eye,
  History,
  Loader2,
  RefreshCw,
  RotateCcw,
  Sparkles,
  XCircle,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  QuestionGradeResult,
  QuizAttemptDetail,
  QuizAttemptSummary,
  QuizContent,
  QuizQuestionItem,
  QuizSubmissionResponse,
  StudyResourceResponse,
  getQuizAttempt,
  getQuizAttempts,
  submitQuizAnswers,
} from "@/lib/api";

interface StudyQuizViewProps {
  documentId: string;
  quizResource: StudyResourceResponse | null;
  getToken: () => Promise<string | null>;
  isRegenerating: boolean;
  onRegenerate: () => void;
  onOpenGenerateDialog: () => void;
  onProgressUpdated?: () => void;
}

export function StudyQuizView({
  documentId,
  quizResource,
  getToken,
  isRegenerating,
  onRegenerate,
  onOpenGenerateDialog,
  onProgressUpdated,
}: StudyQuizViewProps) {
  // Selected options map: { [questionId]: optionIndex }
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, number>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [gradingResult, setGradingResult] = useState<QuizSubmissionResponse | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Review filter post-grading: "all" or "incorrect"
  const [reviewFilter, setReviewFilter] = useState<"all" | "incorrect">("all");

  // Attempt History state
  const [attempts, setAttempts] = useState<QuizAttemptSummary[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [viewingPastAttempt, setViewingPastAttempt] = useState<QuizAttemptDetail | null>(null);
  const [loadingPastAttempt, setLoadingPastAttempt] = useState(false);

  const quizData: QuizContent | null =
    (quizResource?.content as unknown as QuizContent) || null;
  const questions: QuizQuestionItem[] = quizData?.questions || [];
  const totalQuestions = questions.length;
  const answeredCount = Object.keys(selectedAnswers).length;

  // Load attempt history on mount or resource change
  useEffect(() => {
    let isCancelled = false;
    async function loadHistory() {
      if (!quizResource?.id) return;
      try {
        const list = await getQuizAttempts(documentId, getToken, quizResource.id);
        if (!isCancelled) {
          setAttempts(list);
        }
      } catch {
        // Silently preserve empty history
      }
    }

    loadHistory();
    return () => {
      isCancelled = true;
    };
  }, [documentId, quizResource?.id, getToken]);

  const handleSelectOption = (questionId: string, optionIndex: number) => {
    if (gradingResult || viewingPastAttempt) return; // Locked once graded or when viewing history
    setSelectedAnswers((prev) => ({
      ...prev,
      [questionId]: optionIndex,
    }));
  };

  const handleSubmitQuiz = async () => {
    if (!quizResource || totalQuestions === 0) return;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const result = await submitQuizAnswers(
        documentId,
        quizResource.id,
        selectedAnswers,
        getToken
      );
      setGradingResult(result);
      setViewingPastAttempt(null);

      // Refresh attempts list
      const updatedList = await getQuizAttempts(documentId, getToken, quizResource.id);
      setAttempts(updatedList);

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

  if (!quizResource) {
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

  if (totalQuestions === 0) {
    return (
      <div className="p-8 text-center text-xs text-muted-foreground">
        No questions found in this quiz resource.
      </div>
    );
  }

  // Determine which questions to display based on review filter
  const displayedQuestions = questions.filter((q) => {
    if (!gradingResult || reviewFilter === "all") return true;
    const graded = gradingResult.results.find((r) => r.question_id === q.id);
    return graded ? !graded.is_correct : true;
  });

  return (
    <article className="mx-auto w-full max-w-3xl pb-28 pt-4 text-foreground">
      {/* Quiz Top Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b pb-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary">
            <Zap className="size-3.5" />
            <span>Practice Quiz · v{quizResource.version}</span>
          </div>
          <h2 className="mt-1 text-xl font-bold tracking-tight text-foreground sm:text-2xl">
            {quizData?.title || "Practice Quiz"}
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* History Toggle */}
          {attempts.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setHistoryOpen((prev) => !prev)}
              className="h-8 gap-1.5 text-xs"
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
              className="h-8 gap-1.5 text-xs font-medium"
            >
              <RotateCcw className="size-3.5" />
              <span>Retake Quiz</span>
            </Button>
          ) : null}

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
            <span>Regenerate Quiz</span>
          </Button>
        </div>
      </div>

      {quizResource.status === "generating" && (
        <div className="mb-6 flex items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-xs text-amber-600 dark:text-amber-400">
          <Loader2 className="size-4 animate-spin shrink-0" />
          <span>Generating fresh MCQ quiz questions with Kilo Gateway...</span>
        </div>
      )}

      {/* Historical Attempts Drawer / Accordion */}
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
              All Questions ({totalQuestions})
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

      {/* 2. QUESTIONS LIST */}
      <div className="flex flex-col gap-6">
        {displayedQuestions.map((q, idx) => {
          const qId = q.id;
          const userSelectedOption = selectedAnswers[qId];

          // Lookup graded result for this question if submitted
          const gradedQ: QuestionGradeResult | undefined =
            gradingResult?.results.find((r) => r.question_id === qId);

          return (
            <div
              key={qId || idx}
              className={`rounded-2xl border p-6 shadow-xs transition-colors ${
                gradedQ
                  ? gradedQ.is_correct
                    ? "border-emerald-500/30 bg-emerald-500/5"
                    : "border-destructive/30 bg-destructive/5"
                  : "bg-card/50 hover:bg-card/80"
              }`}
            >
              {/* Question Header */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-lg border bg-muted/60 font-mono text-xs font-bold text-foreground">
                    {idx + 1}
                  </span>
                  <div>
                    <h3 className="font-semibold text-foreground text-sm sm:text-base leading-snug">
                      {q.question}
                    </h3>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      {q.difficulty && (
                        <Badge
                          className={`text-[10px] capitalize ${
                            q.difficulty === "easy"
                              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                              : q.difficulty === "medium"
                              ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
                              : "bg-destructive/10 text-destructive border-destructive/20"
                          }`}
                        >
                          {q.difficulty}
                        </Badge>
                      )}
                      {q.source_pages && q.source_pages.length > 0 && (
                        <span className="text-[10px] font-mono text-muted-foreground">
                          Page {q.source_pages.join(", ")}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {gradedQ && (
                  <Badge
                    className={`shrink-0 ${
                      gradedQ.is_correct
                        ? "bg-emerald-500 text-white"
                        : "bg-destructive text-white"
                    }`}
                  >
                    {gradedQ.is_correct ? (
                      <span className="flex items-center gap-1">
                        <CheckCircle2 className="size-3" />
                        Correct
                      </span>
                    ) : (
                      <span className="flex items-center gap-1">
                        <XCircle className="size-3" />
                        Incorrect
                      </span>
                    )}
                  </Badge>
                )}
              </div>

              {/* 4 Options Grid */}
              <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
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
                      "border-primary bg-primary/10 font-semibold text-primary shadow-xs";
                  }

                  return (
                    <div
                      key={optIdx}
                      onClick={() => handleSelectOption(qId, optIdx)}
                      className={`flex items-center gap-3 rounded-xl border p-3.5 text-xs transition-all ${optionStyle}`}
                    >
                      <span
                        className={`flex size-6 shrink-0 items-center justify-center rounded-lg border font-mono text-[11px] font-bold ${
                          isSelected
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-muted-foreground/30 text-muted-foreground"
                        }`}
                      >
                        {String.fromCharCode(65 + optIdx)}
                      </span>
                      <span className="leading-snug">{optText}</span>
                    </div>
                  );
                })}
              </div>

              {/* Explanation (Revealed post-grading) */}
              {gradedQ && (
                <div className="mt-4 rounded-xl border border-primary/20 bg-muted/30 p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-primary">
                      <CheckCircle2 className="size-3.5" />
                      <span>Explanation & Concepts</span>
                    </div>
                    {gradedQ.source_pages && gradedQ.source_pages.length > 0 && (
                      <span className="text-[10px] font-mono text-muted-foreground">
                        Revise: Page {gradedQ.source_pages.join(", ")}
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-foreground/90">
                    {gradedQ.explanation}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {submitError && (
        <div className="mt-6 flex items-center gap-2 rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-xs text-destructive">
          <AlertCircle className="size-4 shrink-0" />
          <span>{submitError}</span>
        </div>
      )}

      {/* Submission Sticky/Bottom Bar */}
      {!gradingResult && (
        <div className="mt-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-2xl border bg-card p-5 shadow-sm">
          <div className="text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">
              {answeredCount} of {totalQuestions}
            </span>{" "}
            questions answered
            {answeredCount < totalQuestions && (
              <span className="ml-2 text-amber-600 dark:text-amber-400">
                ({totalQuestions - answeredCount} remaining)
              </span>
            )}
          </div>

          <Button
            onClick={handleSubmitQuiz}
            disabled={answeredCount === 0 || isSubmitting}
            className="gap-2 font-semibold"
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
    </article>
  );
}
