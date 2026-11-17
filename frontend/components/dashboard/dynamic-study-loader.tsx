"use client";

import { useAuth } from "@clerk/nextjs";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BookOpen, FileQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DocumentResponse, getDocument } from "@/lib/api";
import { getStudyDocument, MOCK_STUDY_DOCUMENTS } from "@/lib/mock-study-data";
import { StudyWorkspace } from "@/components/dashboard/study-workspace";
import { UploadedStudyWorkspace } from "@/components/dashboard/uploaded-study-workspace";

interface DynamicStudyLoaderProps {
  documentId: string;
}

function RealDocumentStudyLoader({ documentId }: { documentId: string }) {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const [realDoc, setRealDoc] = useState<DocumentResponse | null>(null);
  const [fetchFailed, setFetchFailed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isCancelled = false;

    if (!isLoaded || !isSignedIn) return;

    async function loadDocument() {
      try {
        const doc = await getDocument(documentId, getToken);
        if (!isCancelled) {
          setRealDoc(doc);
          setLoading(false);
        }
      } catch {
        if (!isCancelled) {
          setFetchFailed(true);
          setLoading(false);
        }
      }
    }

    loadDocument();

    return () => {
      isCancelled = true;
    };
  }, [documentId, getToken, isLoaded, isSignedIn]);

  if (!isLoaded || (isSignedIn && loading)) {
    return (
      <div className="flex h-full flex-col bg-background">
        <div className="flex h-14 items-center justify-between border-b px-4 md:px-6">
          <div className="h-6 w-24 animate-pulse rounded bg-muted" />
          <div className="h-6 w-36 animate-pulse rounded bg-muted" />
          <div className="h-6 w-8 animate-pulse rounded bg-muted" />
        </div>
        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-6">
          <div className="h-8 w-48 animate-pulse rounded bg-muted" />
          <div className="h-4 w-full animate-pulse rounded bg-muted/60" />
          <div className="h-4 w-5/6 animate-pulse rounded bg-muted/60" />
          <div className="mt-4 h-40 w-full animate-pulse rounded-2xl bg-muted/40" />
        </div>
      </div>
    );
  }

  const notFound = !isSignedIn || fetchFailed || !realDoc;

  if (notFound || !realDoc) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6 text-center">
        <div className="flex size-14 items-center justify-center rounded-2xl border bg-muted text-muted-foreground">
          <FileQuestion className="size-7" />
        </div>
        <h2 className="mt-4 text-xl font-bold tracking-tight text-foreground">
          Study Material Not Found
        </h2>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          We couldn&apos;t find study material matching &ldquo;{documentId}&rdquo;
          or you may not have permission to view it. Try exploring one of our sample chapters below.
        </p>

        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {MOCK_STUDY_DOCUMENTS.map((item) => (
            <Button key={item.id} variant="outline" size="sm" asChild>
              <Link href={`/dashboard/study/${item.id}`}>
                <BookOpen className="size-3.5" />
                <span>{item.title}</span>
              </Link>
            </Button>
          ))}
        </div>

        <div className="mt-6">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/dashboard" className="gap-1.5">
              <ArrowLeft className="size-3.5" />
              <span>Back to Dashboard</span>
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  return <UploadedStudyWorkspace document={realDoc} />;
}

export function DynamicStudyLoader({ documentId }: DynamicStudyLoaderProps) {
  // If it's a sample mock document, render Phase 4 demo workspace directly
  const mockDoc = getStudyDocument(documentId);
  if (mockDoc) {
    return <StudyWorkspace document={mockDoc} />;
  }

  return <RealDocumentStudyLoader documentId={documentId} />;
}
