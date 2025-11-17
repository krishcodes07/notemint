"use client";

import { UserButton, useUser } from "@clerk/nextjs";

export default function DashboardPage() {
  const { user } = useUser();

  return (
    <div className="min-h-screen bg-gray-50 p-6 flex flex-col">
      {/* Header */}
      <header className="w-full flex justify-between items-center mb-8">
        <h1 className="text-xl font-semibold">
          Dashboard
        </h1>

        {/* Clerk account menu (Logout, Manage Account) */}
        <UserButton 
          afterSignOutUrl="/"
          appearance={{
            elements: {
              userButtonAvatarBox: "w-9 h-9"
            }
          }}
        />
      </header>

      {/* Main content */}
      <main className="flex flex-col gap-4">
        <h2 className="text-2xl font-bold">
          Welcome back, {user?.firstName || "User"} 👋
        </h2>

        <p className="text-gray-600">
          Your personalized study dashboard will appear here. Currently building...
        </p>
      </main>
    </div>
  );
}
