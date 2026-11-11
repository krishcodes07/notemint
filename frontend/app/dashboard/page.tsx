import { DashboardGreeting } from "@/components/dashboard/dashboard-greeting";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { NewStudyInput } from "@/components/dashboard/new-study-input";

export const metadata = {
  title: "Dashboard",
};

export default function DashboardPage() {
  return (
    <div className="flex h-full flex-col">
      {/* Top dashboard header with quick theme toggle & mobile trigger */}
      <DashboardHeader />

      {/* Main centered study entry area matching the hand-drawn sketch */}
      <main className="relative flex flex-1 flex-col items-center justify-center px-4 py-12 md:py-16">
        <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-8 sm:gap-10">
          <DashboardGreeting />
          <NewStudyInput />
        </div>
      </main>
    </div>
  );
}
