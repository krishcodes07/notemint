import { DashboardDocuments } from "@/components/dashboard/dashboard-documents";
import { DashboardGreeting } from "@/components/dashboard/dashboard-greeting";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { NewStudyInput } from "@/components/dashboard/new-study-input";

export const metadata = {
  title: "Study Dashboard",
  description: "Access your personalized study workspace, notes, and flashcard sets.",
};

export default function DashboardPage() {
  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {/* Top dashboard header with breadcrumb and quick controls */}
      <DashboardHeader title="Workspace" />

      {/* Main scrollable dashboard view */}
      <main className="flex-1 overflow-y-auto px-4 py-8 sm:px-8 sm:py-12">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-10">
          {/* Welcome Greeting & Command Input Hub */}
          <div className="flex flex-col items-center gap-6">
            <DashboardGreeting />
            <NewStudyInput />
          </div>

          {/* User's Study Documents Section */}
          <DashboardDocuments />
        </div>
      </main>
    </div>
  );
}
