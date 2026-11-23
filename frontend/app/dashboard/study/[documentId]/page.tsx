import { Metadata } from "next";
import { Suspense } from "react";
import { getStudyDocument, MOCK_STUDY_DOCUMENTS } from "@/lib/mock-study-data";
import { DynamicStudyLoader } from "@/components/dashboard/dynamic-study-loader";

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
    title: doc ? doc.title : "Study Workspace",
  };
}

function StudyWorkspaceSkeleton() {
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

async function StudyContent({
  params,
}: {
  params: Promise<{ documentId: string }>;
}) {
  const { documentId } = await params;
  return <DynamicStudyLoader documentId={documentId} />;
}

export default function StudyPage({ params }: StudyPageProps) {
  return (
    <Suspense fallback={<StudyWorkspaceSkeleton />}>
      <StudyContent params={params} />
    </Suspense>
  );
}
