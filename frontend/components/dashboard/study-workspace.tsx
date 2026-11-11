"use client";

import { useState } from "react";
import { StudyDocument } from "@/lib/mock-study-data";
import { WorkspaceHeader } from "@/components/dashboard/workspace-header";
import { WorkspaceContent } from "@/components/dashboard/workspace-content";
import {
  WorkspaceNavigation,
  WorkspaceTab,
} from "@/components/dashboard/workspace-navigation";

interface StudyWorkspaceProps {
  document: StudyDocument;
}

export function StudyWorkspace({ document }: StudyWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("notes");

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-background">
      {/* Workspace top header with title and divider */}
      <WorkspaceHeader
        title={document.title}
        subject={document.subject}
        classLevel={document.classLevel}
      />

      {/* Scrollable study content area */}
      <main className="flex-1 overflow-y-auto px-4 md:px-8">
        <WorkspaceContent
          document={document}
          activeTab={activeTab}
          onNavigateTab={setActiveTab}
        />
      </main>

      {/* Floating bottom navigation bar matching sketch */}
      <WorkspaceNavigation
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />
    </div>
  );
}

