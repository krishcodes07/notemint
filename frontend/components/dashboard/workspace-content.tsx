"use client";

import { useState } from "react";
import {
  BookOpen,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  Layers,
  RotateCw,
  Send,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConceptDiagram } from "@/components/dashboard/concept-diagram";
import { WorkspaceEmptyState } from "@/components/dashboard/workspace-empty-state";
import { WorkspaceTab } from "@/components/dashboard/workspace-navigation";
import { StudyDocument } from "@/lib/mock-study-data";

interface WorkspaceContentProps {
  document: StudyDocument;
  activeTab: WorkspaceTab;
  onNavigateTab: (tab: WorkspaceTab) => void;
}

export function WorkspaceContent({
  document,
  activeTab,
  onNavigateTab,
}: WorkspaceContentProps) {
  // State for interactive mock previews
  const [flashcardFlipped, setFlashcardFlipped] = useState(false);
  const [selectedQuizOption, setSelectedQuizOption] = useState<number | null>(
    null
  );
  const [showQuestionAnswer, setShowQuestionAnswer] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState([
    {
      sender: "ai",
      text: "Namaste! I am your NoteMint AI Teacher. I have reviewed your notes on 'Life Processes'. What would you like to clarify? You can ask in English or Hindi (Hinglish).",
    },
    {
      sender: "user",
      text: "Can you explain why autotrophic nutrition is essential for the entire biosphere?",
    },
    {
      sender: "ai",
      text: "Autotrophs (green plants) are the primary producers. They capture solar energy and convert it into chemical energy (glucose) via photosynthesis. Without them, heterotrophs would have no source of organic carbon or oxygen!",
    },
  ]);

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    const userMsg = chatInput.trim();
    setChatInput("");
    setChatMessages((prev) => [
      ...prev,
      { sender: "user", text: userMsg },
      {
        sender: "ai",
        text: `Based on your ${document.title} notes: This concept is covered in depth. In Phase 9, I will provide live streaming context-aware responses with citations straight from your document!`,
      },
    ]);
  };

  // 1. NOTES TAB
  if (activeTab === "notes") {
    return (
      <article className="mx-auto w-full max-w-3xl pb-24 pt-6 text-foreground">
        {/* Notebook-styled content header */}
        <div className="mb-8 border-b pb-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
            <BookOpen className="size-3.5" />
            <span>Study Notes</span>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {document.notes.overview}
          </p>
        </div>

        {/* Note Sections */}
        <div className="flex flex-col gap-8">
          {document.notes.sections.map((section, idx) => (
            <section
              key={idx}
              className="flex flex-col gap-3 rounded-2xl border bg-card/40 p-5 shadow-xs transition-colors hover:bg-card/70"
            >
              <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                {section.title}
              </h2>
              <p className="text-sm leading-relaxed text-foreground/90">
                {section.content}
              </p>

              {/* Sketch circular diagram injected on Nutrition section */}
              {section.title === "Nutrition" && (
                <div className="flex justify-center sm:justify-end">
                  <ConceptDiagram title="Autotrophic & Heterotrophic Energy Cycle" />
                </div>
              )}

              {/* Subsections & bullet points */}
              {section.subsections && section.subsections.length > 0 && (
                <div className="mt-2 flex flex-col gap-4 border-t pt-3">
                  {section.subsections.map((sub, subIdx) => (
                    <div key={subIdx} className="flex flex-col gap-1.5">
                      <h3 className="text-sm font-semibold text-primary">
                        {sub.subtitle}
                      </h3>
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        {sub.body}
                      </p>
                      {sub.points && sub.points.length > 0 && (
                        <ul className="mt-1 flex flex-col gap-1 pl-4">
                          {sub.points.map((pt, ptIdx) => (
                            <li
                              key={ptIdx}
                              className="list-disc text-xs text-foreground/80"
                            >
                              {pt}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      </article>
    );
  }

  // 2. QUESTIONS TAB
  if (activeTab === "questions") {
    return (
      <div className="pb-24 pt-6">
        <WorkspaceEmptyState
          icon={HelpCircle}
          title="Important Questions"
          phaseBadge="Phase 7 · AI Generation Engine"
          description="High-yield exam questions ranked by importance, with step-by-step marking schemes and model answers."
          features={[
            "CBSE & Board syllabus alignment with 1-mark, 3-mark, and 5-mark categorization",
            "Contextual citations linking each question directly to its source paragraph",
            "Self-assessment mode with collapsible model answers",
          ]}
          onAction={() => onNavigateTab("notes")}
          actionLabel="Back to Notes"
          previewComponent={
            <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4 text-left shadow-xs">
              <div className="flex items-center justify-between">
                <Badge variant="outline" className="text-[10px]">
                  Sample Question · 3 Marks
                </Badge>
                <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                  High Probability
                </span>
              </div>
              <h4 className="text-sm font-semibold text-foreground">
                Differentiate between autotrophic and heterotrophic nutrition.
                Give two examples of each.
              </h4>
              <button
                type="button"
                onClick={() => setShowQuestionAnswer(!showQuestionAnswer)}
                className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                <span>{showQuestionAnswer ? "Hide" : "Reveal"} Model Answer</span>
                {showQuestionAnswer ? (
                  <ChevronUp className="size-3.5" />
                ) : (
                  <ChevronDown className="size-3.5" />
                )}
              </button>
              {showQuestionAnswer && (
                <div className="rounded-lg bg-muted/60 p-3 text-xs leading-relaxed text-muted-foreground animate-in fade-in">
                  <p className="font-medium text-foreground">Model Answer:</p>
                  <p className="mt-1">
                    1. Autotrophs synthesize their own organic food from simple
                    inorganic substances (CO₂ + H₂O) using sunlight and
                    chlorophyll. Examples: Green plants, Cyanobacteria.
                  </p>
                  <p className="mt-1">
                    2. Heterotrophs cannot manufacture their own food and depend
                    on autotrophs directly or indirectly. Examples: Amoeba,
                    Human beings, Fungi.
                  </p>
                </div>
              )}
            </div>
          }
        />
      </div>
    );
  }

  // 3. FLASHCARDS TAB
  if (activeTab === "flashcards") {
    return (
      <div className="pb-24 pt-6">
        <WorkspaceEmptyState
          icon={Layers}
          title="Interactive Flashcards"
          phaseBadge="Phase 7 · Active Recall"
          description="Spaced-repetition flashcards designed to lock key terms, equations, and definitions into long-term memory."
          features={[
            "Two-sided active recall testing with instant flip animations",
            "Difficulty rating (Easy, Medium, Hard) to schedule smart reviews",
            "Visual concept cards with embedded chemical and biological diagrams",
          ]}
          onAction={() => onNavigateTab("notes")}
          actionLabel="Back to Notes"
          previewComponent={
            <div className="flex flex-col items-center gap-3">
              <div
                onClick={() => setFlashcardFlipped(!flashcardFlipped)}
                className="group relative flex h-48 w-full cursor-pointer flex-col justify-between rounded-2xl border-2 border-primary/20 bg-card p-6 shadow-md transition-all hover:border-primary/50 hover:shadow-lg active:scale-[0.99]"
              >
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="font-mono">Card 1 of {document.mockCounts.flashcards}</span>
                  <span className="flex items-center gap-1 text-primary">
                    <RotateCw className="size-3" />
                    <span>Click to flip</span>
                  </span>
                </div>

                <div className="my-auto text-center">
                  {!flashcardFlipped ? (
                    <div>
                      <span className="text-xs uppercase tracking-wider text-muted-foreground">
                        Question
                      </span>
                      <h4 className="mt-2 text-base font-semibold text-foreground">
                        What is the overall balanced chemical equation for
                        photosynthesis?
                      </h4>
                    </div>
                  ) : (
                    <div>
                      <span className="text-xs uppercase tracking-wider text-primary">
                        Answer
                      </span>
                      <p className="mt-2 font-mono text-sm font-bold text-foreground">
                        6CO₂ + 12H₂O + Sunlight + Chlorophyll → C₆H₁₂O₆ + 6O₂ +
                        6H₂O
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Chlorophyll absorbs light energy and splits water into
                        hydrogen and oxygen.
                      </p>
                    </div>
                  )}
                </div>

                <div className="text-center text-[10px] text-muted-foreground">
                  {flashcardFlipped ? "Showing Answer" : "Showing Question"}
                </div>
              </div>
            </div>
          }
        />
      </div>
    );
  }

  // 4. QUIZ TAB
  if (activeTab === "quiz") {
    const quizOptions = [
      "Starch and Water",
      "Carbon dioxide and Water",
      "Chlorophyll and Sunlight",
      "Carbon dioxide, Water, Chlorophyll and Sunlight",
    ];
    const correctOption = 3;

    return (
      <div className="pb-24 pt-6">
        <WorkspaceEmptyState
          icon={CheckCircle2}
          title="MCQ Quizzes"
          phaseBadge="Phase 7 · Diagnostic Testing"
          description="Adaptive multiple-choice quizzes that test your factual recall, analytical understanding, and exam readiness."
          features={[
            "Instant grading with explanatory feedback for every option",
            "Timed test mode simulating real board exam constraints",
            "Performance analytics highlighting weak topics for targeted revision",
          ]}
          onAction={() => onNavigateTab("notes")}
          actionLabel="Back to Notes"
          previewComponent={
            <div className="flex flex-col gap-4 rounded-2xl border bg-card p-5 text-left shadow-xs">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-muted-foreground">
                  Question 1 / {document.mockCounts.quizQuestions}
                </span>
                <Badge variant="secondary" className="text-[10px]">
                  Board Favorite
                </Badge>
              </div>

              <h4 className="text-sm font-semibold text-foreground">
                Which of the following are necessary raw materials for
                autotrophic nutrition?
              </h4>

              <div className="flex flex-col gap-2">
                {quizOptions.map((opt, i) => {
                  const isSelected = selectedQuizOption === i;
                  const isCorrect = i === correctOption;
                  let style = "border-border hover:bg-muted/60";

                  if (selectedQuizOption !== null) {
                    if (isCorrect) {
                      style =
                        "border-emerald-500 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200";
                    } else if (isSelected) {
                      style =
                        "border-destructive bg-destructive/10 text-destructive";
                    }
                  }

                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setSelectedQuizOption(i)}
                      className={`flex items-center gap-3 rounded-xl border p-2.5 text-left text-xs font-medium transition-all ${style}`}
                    >
                      <span className="flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold">
                        {String.fromCharCode(65 + i)}
                      </span>
                      <span>{opt}</span>
                    </button>
                  );
                })}
              </div>

              {selectedQuizOption !== null && (
                <p className="mt-1 text-xs text-muted-foreground animate-in fade-in">
                  {selectedQuizOption === correctOption ? (
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                      ✓ Correct! Autotrophs require all four elements to
                      synthesize glucose.
                    </span>
                  ) : (
                    <span className="font-semibold text-destructive">
                      ✗ Not quite. All four components (CO₂, H₂O, Chlorophyll,
                      and Sunlight) are essential.
                    </span>
                  )}
                </p>
              )}
            </div>
          }
        />
      </div>
    );
  }

  // 5. AI TALK TAB
  return (
    <div className="pb-24 pt-6">
      <WorkspaceEmptyState
        icon={Sparkles}
        title="AI Teacher Talk"
        phaseBadge="Phase 9 · Conversational Socratic Tutor"
        description="A personalized AI study companion strictly grounded in your document. Ask clarifying questions, request analogies, and get explanations in English or Hindi."
        features={[
          "Grounding in your exact uploaded textbook and lecture notes",
          "Bilingual capability: Hindi, English, and Hinglish explanations",
          "Step-by-step Socratic guidance without hallucinating facts",
        ]}
        onAction={() => onNavigateTab("notes")}
        actionLabel="Back to Notes"
        previewComponent={
          <div className="flex flex-col rounded-2xl border bg-card p-4 shadow-xs text-left">
            <div className="flex items-center gap-2 border-b pb-2 text-xs font-semibold text-foreground">
              <Bot className="size-4 text-primary" />
              <span>NoteMint AI Study Companion</span>
              <span className="ml-auto rounded-full bg-brand-soft px-1.5 py-0.5 text-[9px] font-semibold text-primary">
                Preview Mode
              </span>
            </div>

            {/* Chat message stream */}
            <div className="my-3 flex max-h-52 flex-col gap-2.5 overflow-y-auto pr-1">
              {chatMessages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex flex-col gap-1 rounded-xl p-2.5 text-xs ${
                    msg.sender === "user"
                      ? "ml-8 bg-primary text-primary-foreground self-end"
                      : "mr-8 bg-muted text-foreground self-start"
                  }`}
                >
                  <span className="text-[9px] opacity-75 font-semibold">
                    {msg.sender === "user" ? "You" : "AI Teacher"}
                  </span>
                  <p className="leading-relaxed">{msg.text}</p>
                </div>
              ))}
            </div>

            {/* Chat input form */}
            <form onSubmit={handleSendChat} className="flex items-center gap-1.5 pt-2 border-t">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Ask your AI Teacher about this chapter..."
                className="flex-1 bg-transparent px-2 text-xs outline-hidden placeholder:text-muted-foreground"
              />
              <Button type="submit" size="sm" className="h-7 px-2.5 text-xs gap-1">
                <span>Ask</span>
                <Send className="size-3" />
              </Button>
            </form>
          </div>
        }
      />
    </div>
  );
}

