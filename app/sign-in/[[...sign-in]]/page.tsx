"use client"

import { SignIn } from "@clerk/nextjs"
import { dark } from "@clerk/themes"
import { useTheme } from "next-themes"

export default function SignInPage() {
  const { resolvedTheme } = useTheme()

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <SignIn
        appearance={{
          baseTheme: resolvedTheme === "dark" ? dark : undefined,
          elements: {
            formButtonPrimary: "bg-primary text-primary-foreground hover:bg-primary/90",
            card: "shadow-none",
            headerTitle: "text-lg font-semibold",
            headerSubtitle: "text-muted-foreground",
          },
        }}
      />
    </div>
  )
}
