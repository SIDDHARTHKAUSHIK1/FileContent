"use client"

import React, { useState } from "react"
import {
  FileText,
  Table,
  Presentation,
  Code,
  Layers,
  Sparkles,
  Info,
  ChevronDown,
  ChevronUp,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"

export function SupportedFileTypesBanner() {
  const [showDetails, setShowDetails] = useState(false)

  const formats = [
    { label: "PDF", color: "text-red-500 bg-red-500/10 border-red-500/20" },
    { label: "Word (.docx, .doc)", color: "text-blue-500 bg-blue-500/10 border-blue-500/20" },
    { label: "Excel (.xlsx, .csv)", color: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20" },
    { label: "PowerPoint (.pptx)", color: "text-orange-500 bg-orange-500/10 border-orange-500/20" },
    { label: "Code (JS, TS, PY, Java, HTML, etc.)", color: "text-indigo-500 bg-indigo-500/10 border-indigo-500/20" },
    { label: "Text (.txt, .md, .log)", color: "text-zinc-500 bg-zinc-500/10 border-zinc-500/20" },
  ]

  return (
    <div className="mb-6">
      {/* Clean, Simple Horizontal Pill Bar */}
      <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
        <span className="text-muted-foreground font-medium flex items-center gap-1">
          Supported Formats:
        </span>
        {formats.map((fmt) => (
          <Badge
            key={fmt.label}
            variant="outline"
            className={`text-[11px] font-medium px-2 py-0.5 border ${fmt.color}`}
          >
            {fmt.label}
          </Badge>
        ))}
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-0.5 text-[11px] font-medium ml-1"
        >
          <Sparkles className="h-3 w-3" />
          <span>+ OCR</span>
          {showDetails ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
      </div>

      {/* Optional details drawer */}
      {showDetails && (
        <div className="mt-3 p-3.5 rounded-xl border border-border/60 bg-muted/30 text-xs text-muted-foreground text-center max-w-xl mx-auto animate-in fade-in-50 duration-200">
          <p>
            Drop any individual file or an entire folder. All text, code, spreadsheets, presentations, and scanned PDF images (via Tesseract OCR) are automatically decoded and indexed in memory.
          </p>
        </div>
      )}
    </div>
  )
}
