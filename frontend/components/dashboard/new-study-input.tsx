"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BookOpen,
  Plus,
  Sparkles,
  X,
  Lightbulb,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MOCK_STUDY_DOCUMENTS } from "@/lib/mock-study-data";

export function NewStudyInput() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [stagedTopic, setStagedTopic] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = query.trim();
    if (!clean) return;

    // Check if user input matches one of our mock documents
    const match = MOCK_STUDY_DOCUMENTS.find(
      (doc) =>
        doc.title.toLowerCase().includes(clean.toLowerCase()) ||
        clean.toLowerCase().includes(doc.title.toLowerCase())
    );

    if (match) {
      router.push(`/dashboard/study/${match.id}`);
      return;
    }

    // Otherwise stage for dialog
    setStagedTopic(clean);
    setModalOpen(true);
  };

  const handleClear = () => {
    setQuery("");
  };

  const handleQuickSelect = (id: string) => {
    router.push(`/dashboard/study/${id}`);
  };

  return (
    <div className="w-full max-w-2xl">
      <form onSubmit={handleSubmit} className="relative">
        <div className="group relative flex items-center rounded-2xl border-2 border-border/90 bg-card/80 px-4 py-3 shadow-xs transition-all duration-200 focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/10 hover:border-border">
          {/* Plus icon on the left matching sketch */}
          <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-primary transition-transform group-focus-within:scale-105">
            <Plus className="size-4 stroke-[2.5]" aria-hidden />
          </div>

          {/* Text Input */}
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Class 10th Biology Heredity"
            className="ml-3.5 flex-1 bg-transparent text-base font-medium placeholder:text-muted-foreground/70 focus:outline-hidden"
          />

          {/* Right actions: Clear button and Submit */}
          <div className="flex items-center gap-1.5 pl-2">
            {query.length > 0 && (
              <button
                type="button"
                onClick={handleClear}
                className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Clear input"
              >
                <X className="size-4" />
              </button>
            )}

            <Button
              type="submit"
              size="sm"
              disabled={!query.trim()}
              className="h-8 gap-1 rounded-xl px-3 text-xs shadow-xs"
            >
              <span>Study</span>
              <ArrowRight className="size-3.5" />
            </Button>
          </div>
        </div>
      </form>

      {/* Suggested quick chips */}
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        <span className="text-xs text-muted-foreground font-medium flex items-center gap-1">
          <Sparkles className="size-3 text-primary" />
          <span>Quick dive:</span>
        </span>
        {MOCK_STUDY_DOCUMENTS.map((doc) => (
          <button
            key={doc.id}
            type="button"
            onClick={() => handleQuickSelect(doc.id)}
            className="rounded-full border border-border/80 bg-background/60 px-3 py-1 text-xs font-medium text-muted-foreground transition-all hover:border-primary/50 hover:bg-brand-soft/20 hover:text-foreground active:scale-95"
          >
            {doc.title}
          </button>
        ))}
      </div>

      {/* Roadmap Dialog for custom topics */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2 text-primary">
              <Lightbulb className="size-5" />
              <DialogTitle>Study Topic Ready</DialogTitle>
            </div>
            <DialogDescription>
              &ldquo;{stagedTopic}&rdquo; has been staged for your study workspace.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3 rounded-xl border bg-muted/40 p-4 text-xs leading-relaxed text-muted-foreground">
            <p>
              <strong className="font-semibold text-foreground">
                Phase 4 Milestone:
              </strong>{" "}
              In this phase, we established the distraction-free dashboard and
              study workspace interface. Actual PDF uploading and storage
              integration will land in <strong>Phase 5</strong>, and automated
              AI generation in <strong>Phase 7</strong>.
            </p>
            <p>
              You can test the full study workspace, formatted notes, and bottom
              tab navigation right now with our sample chapter:{" "}
              <strong className="text-foreground">Life Processes</strong>.
            </p>
          </div>

          <DialogFooter className="gap-2 sm:justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setModalOpen(false);
                setQuery("");
              }}
            >
              Stay on Dashboard
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setModalOpen(false);
                router.push("/dashboard/study/life-processes");
              }}
              className="gap-1.5"
            >
              <BookOpen className="size-3.5" />
              <span>Explore Life Processes</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

