"use client";

import { BookOpen } from "lucide-react";

interface TeacherSourceCitationProps {
  page: number;
  onClick: (page: number) => void;
}

export function TeacherSourceCitation({ page, onClick }: TeacherSourceCitationProps) {
  return (
    <button
      type="button"
      onClick={() => onClick(page)}
      className="inline-flex items-center gap-1 px-2 py-0.5 mx-0.5 my-0.5 rounded-full text-xs font-semibold bg-brand-soft text-primary border border-primary/25 hover:bg-primary/10 transition-colors shadow-2xs cursor-pointer focus:outline-hidden focus:ring-1 focus:ring-primary"
      title={`Open original PDF at Page ${page}`}
      aria-label={`Jump to page ${page}`}
    >
      <BookOpen className="size-3 text-primary" />
      <span>Page {page}</span>
    </button>
  );
}

