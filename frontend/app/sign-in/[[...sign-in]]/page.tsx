"use client";

import { SignIn } from "@clerk/nextjs";
import AuthLayout from "@/components/ui/AuthLayout";
import { useTheme } from "next-themes";
import { dark, neobrutalism } from "@clerk/themes";

export default function Page() {
  const { theme } = useTheme();

  return (
    <AuthLayout>
      <SignIn
        redirectUrl="/dashboard"
        appearance={{
          baseTheme: theme === "dark" ? dark : neobrutalism,
          elements: {
            card: "bg-transparent shadow-none w-full border-none p-0",
            headerTitle:
              theme === "dark"
                ? "text-3xl font-bold text-white"
                : "text-3xl font-bold text-black",
            headerSubtitle:
              theme === "dark" ? "text-zinc-400" : "text-zinc-600",
            socialButtonsBlockButton:
              theme === "dark"
                ? "bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-white h-10"
                : "bg-white border border-zinc-200 hover:bg-zinc-100 text-black h-10",
            formFieldLabel:
              theme === "dark" ? "text-zinc-300" : "text-zinc-800",
            formFieldInput:
              theme === "dark"
                ? "bg-zinc-900 border-zinc-800 text-white placeholder:text-zinc-500"
                : "bg-white border-zinc-300 text-black placeholder:text-zinc-500",
            formButtonPrimary:
              theme === "dark"
                ? "bg-white text-black hover:bg-zinc-200 h-10 font-bold"
                : "bg-black text-white hover:bg-zinc-800 h-10 font-bold",
            footerActionText:
              theme === "dark" ? "text-zinc-500" : "text-zinc-600",
            footerActionLink:
              theme === "dark"
                ? "text-white hover:underline"
                : "text-black hover:underline",
            dividerLine:
              theme === "dark" ? "bg-zinc-800" : "bg-zinc-300",
            dividerText:
              theme === "dark" ? "text-zinc-500" : "text-zinc-600",
          },
          layout: {
            socialButtonsPlacement: "top",
            showOptionalFields: false,
          },
        }}
      />
    </AuthLayout>
  );
}
