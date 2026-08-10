"use client"

import { GlobalHeader } from "@/components/global-header"
import { SupportedFileTypesBanner } from "@/components/supported-file-types-banner"
import { UnifiedFileSearch } from "@/components/unified-file-search"

export default function FileSearchHome() {
  return (
    <div className="min-h-screen bg-background flex flex-col selection:bg-purple-500/20">
      <GlobalHeader />

      <main className="flex-1 container mx-auto max-w-4xl px-4 py-8">
        {/* Simple, Minimalist Hero */}
        <div className="text-center max-w-2xl mx-auto mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mb-2">
            Universal Content Search & AI
          </h1>
          <p className="text-muted-foreground text-xs sm:text-sm">
            Search inside any folder, PDF, Word doc, Excel sheet, code, or text file.
          </p>
        </div>

        {/* Supported File Formats Indicator */}
        <SupportedFileTypesBanner />

        {/* Unified Search Hub */}
        <UnifiedFileSearch />
      </main>

      <footer className="border-t border-border/40 py-5 text-center text-[11px] text-muted-foreground">
        <p>© {new Date().getFullYear()} File Content Tracker • Universal Multi-Format Search & AI</p>
      </footer>
    </div>
  )
}
