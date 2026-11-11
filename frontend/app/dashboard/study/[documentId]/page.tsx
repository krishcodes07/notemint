import { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft, BookOpen, FileQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getStudyDocument, MOCK_STUDY_DOCUMENTS } from "@/lib/mock-study-data";
import { StudyWorkspace } from "@/components/dashboard/study-workspace";

interface StudyPageProps {
  params: Promise<{
    documentId: string;
  }>;
}

export function generateStaticParams() {
  return MOCK_STUDY_DOCUMENTS.map((doc) => ({
    documentId: doc.id,
  }));
}

export async function generateMetadata({
  params,
}: StudyPageProps): Promise<Metadata> {
  const { documentId } = await params;
  const doc = getStudyDocument(documentId);

  return {
    title: doc ? `${doc.title} — Study Workspace` : "Study Material",
  };
}

function StudyWorkspaceSkeleton() {
  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header skeleton */}
      <div className="flex h-14 items-center justify-between border-b px-4 md:px-6">
        <div className="h-6 w-24 animate-pulse rounded bg-muted" />
        <div className="h-6 w-36 animate-pulse rounded bg-muted" />
        <div className="h-6 w-8 animate-pulse rounded bg-muted" />
      </div>

      {/* Content skeleton */}
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-6">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-4 w-full animate-pulse rounded bg-muted/60" />
        <div className="h-4 w-5/6 animate-pulse rounded bg-muted/60" />
        <div className="mt-4 h-40 w-full animate-pulse rounded-2xl bg-muted/40" />
      </div>
    </div>
  );
}

async function StudyDocumentLoader({
  params,
}: {
  params: Promise<{ documentId: string }>;
}) {
  const { documentId } = await params;
  const doc = getStudyDocument(documentId);

  if (!doc) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6 text-center">
        <div className="flex size-14 items-center justify-center rounded-2xl border bg-muted text-muted-foreground">
          <FileQuestion className="size-7" />
        </div>
        <h2 className="mt-4 text-xl font-bold tracking-tight text-foreground">
          Study Material Not Found
        </h2>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          We couldn&apos;t find study material matching &ldquo;{documentId}&rdquo;.
          Try exploring one of our sample chapters below.
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

  return <StudyWorkspace document={doc} />;
}

export default function StudyPage({ params }: StudyPageProps) {
  return (
    <Suspense fallback={<StudyWorkspaceSkeleton />}>
      <StudyDocumentLoader params={params} />
    </Suspense>
  );
}
