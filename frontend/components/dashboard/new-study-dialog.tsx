"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, Sparkles, ArrowRight, Lightbulb } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MOCK_STUDY_DOCUMENTS } from "@/lib/mock-study-data";

interface NewStudyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NewStudyDialog({ open, onOpenChange }: NewStudyDialogProps) {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [stage, setStage] = useState<"input" | "notice">("input");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim()) return;

    // Check if input matches an existing mock document
    const lower = topic.trim().toLowerCase();
    const matched = MOCK_STUDY_DOCUMENTS.find(
      (doc) =>
        doc.title.toLowerCase().includes(lower) ||
        lower.includes(doc.title.toLowerCase())
    );

    if (matched) {
      onOpenChange(false);
      setTopic("");
      router.push(`/dashboard/study/${matched.id}`);
      return;
    }

    // Otherwise show information stage explaining Phase 5/7 roadmap
    setStage("notice");
  };

  const handleSelectSample = (id: string) => {
    onOpenChange(false);
    setTopic("");
    setStage("input");
    router.push(`/dashboard/study/${id}`);
  };

  const handleClose = () => {
    onOpenChange(false);
    setTopic("");
    setStage("input");
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        {stage === "input" ? (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2 text-primary">
                <Sparkles className="size-5" />
                <DialogTitle>Start a New Study Topic</DialogTitle>
              </div>
              <DialogDescription>
                Enter any chapter, subject, or topic you want to master.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4 py-2">
              <div className="flex flex-col gap-1.5">
                <Input
                  autoFocus
                  placeholder="e.g. Class 10th Biology Heredity"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  className="h-10 text-sm"
                />
              </div>

              <div>
                <p className="mb-2 text-xs font-medium text-muted-foreground">
                  Or pick a ready-to-study sample chapter:
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {MOCK_STUDY_DOCUMENTS.map((doc) => (
                    <button
                      key={doc.id}
                      type="button"
                      onClick={() => handleSelectSample(doc.id)}
                      className="flex flex-col items-start rounded-lg border p-2.5 text-left transition-colors hover:border-primary hover:bg-brand-soft/20"
                    >
                      <span className="text-xs font-semibold text-foreground">
                        {doc.title}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {doc.subject} · {doc.classLevel}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <DialogFooter className="mt-2 sm:justify-between">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleClose}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={!topic.trim()}
                  className="gap-1.5"
                >
                  <span>Begin Study</span>
                  <ArrowRight className="size-3.5" />
                </Button>
              </DialogFooter>
            </form>
          </>
        ) : (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2 text-primary">
                <Lightbulb className="size-5" />
                <DialogTitle>Study Topic Queued</DialogTitle>
              </div>
              <DialogDescription>
                &ldquo;{topic}&rdquo; is ready for material generation.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-3 rounded-xl border bg-muted/40 p-4 text-xs leading-relaxed text-muted-foreground">
              <p>
                <strong className="font-semibold text-foreground">
                  NoteMint Roadmap Note:
                </strong>{" "}
                Custom PDF document uploads arrive in <strong>Phase 5</strong>,
                followed by AI extraction & automated resource generation in{" "}
                <strong>Phase 7</strong>.
              </p>
              <p>
                In this Phase 4 preview, you can test the full study workspace
                and bottom navigation with our curated sample material:{" "}
                <strong className="text-foreground">Life Processes</strong>.
              </p>
            </div>

            <DialogFooter className="mt-2 sm:justify-end gap-2">
              <Button variant="outline" size="sm" onClick={handleClose}>
                Dismiss
              </Button>
              <Button
                size="sm"
                onClick={() => handleSelectSample("life-processes")}
                className="gap-1.5"
              >
                <BookOpen className="size-3.5" />
                <span>Open Life Processes</span>
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

