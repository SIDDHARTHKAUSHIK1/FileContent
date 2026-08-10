"use client"

import { GlobalHeader } from "@/components/global-header"
import { SupportedFileTypesBanner } from "@/components/supported-file-types-banner"
import { UnifiedFileSearch } from "@/components/unified-file-search"
import { Badge } from "@/components/ui/badge"
import { Sparkles, ShieldCheck, Zap, Search } from "lucide-react"

export default function FileSearchHome() {
  return (
    <div className="min-h-screen bg-background flex flex-col selection:bg-purple-500/20">
      <GlobalHeader />

      <main className="flex-1 container mx-auto max-w-6xl px-4 py-8">
        {/* Hero Section */}
        <div className="text-center max-w-3xl mx-auto mb-8">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border border-purple-500/30 text-purple-600 dark:text-purple-400 bg-purple-500/10 mb-4 shadow-sm">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Universal Multi-Format Content Search & RAG Intelligence</span>
          </div>

          <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight mb-3 bg-gradient-to-r from-foreground via-foreground/90 to-muted-foreground bg-clip-text">
            All-in-One File & Document Search
          </h1>

          <p className="text-muted-foreground text-sm sm:text-base leading-relaxed max-w-2xl mx-auto">
            Drop any folder or files to instantly search keywords, code, slides, sheets, and text—or chat with the AI assistant for strictly grounded answers.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-4 mt-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5 text-amber-500" /> Instant Client & Server Indexing
            </span>
            <span className="flex items-center gap-1.5">
              <Search className="h-3.5 w-3.5 text-blue-500" /> Deep Keyword & Regex Matching
            </span>
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" /> 100% Document Grounded AI
            </span>
          </div>
        </div>

        {/* Supported File Types Showcase Banner */}
        <SupportedFileTypesBanner />

        {/* Unified Search & AI Assistant Workspace */}
        <UnifiedFileSearch />
      </main>

      <footer className="border-t border-border/40 py-6 text-center text-xs text-muted-foreground">
        <div className="container mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p>© {new Date().getFullYear()} File Content Tracker • Universal Document Search & AI Intelligence</p>
          <div className="flex items-center gap-4">
            <span>Powered by Next.js & NVIDIA RAG</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
