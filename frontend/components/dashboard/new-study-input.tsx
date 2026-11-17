"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Plus,
  Sparkles,
  UploadCloud,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { MOCK_STUDY_DOCUMENTS } from "@/lib/mock-study-data";
import { UploadDialog } from "@/components/dashboard/upload-dialog";

export function NewStudyInput() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
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

    // Otherwise open upload dialog with the staged topic
    setStagedTopic(clean);
    setUploadDialogOpen(true);
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
          {/* Plus icon on the left matching sketch - clicking it opens upload dialog */}
          <button
            type="button"
            onClick={() => {
              setStagedTopic(query.trim());
              setUploadDialogOpen(true);
            }}
            title="Upload study PDF"
            className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-primary transition-transform group-focus-within:scale-105 hover:bg-primary hover:text-primary-foreground"
          >
            <Plus className="size-4 stroke-[2.5]" aria-hidden />
          </button>

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
              className="h-8 gap-1.5 rounded-xl px-3 text-xs shadow-xs"
            >
              {query.trim() ? (
                <>
                  <span>Study</span>
                  <ArrowRight className="size-3.5" />
                </>
              ) : (
                <>
                  <UploadCloud className="size-3.5" />
                  <span>Upload PDF</span>
                </>
              )}
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

      {/* Upload Dialog */}
      <UploadDialog
        open={uploadDialogOpen}
        onOpenChange={setUploadDialogOpen}
        defaultTopic={stagedTopic}
      />
    </div>
  );
}
