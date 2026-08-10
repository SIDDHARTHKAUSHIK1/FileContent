"use client"

import React, { useState } from "react"
import {
  FileText,
  Table,
  Presentation,
  Code,
  ScanText,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Layers,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

export const FILE_CATEGORY_SPECS = [
  {
    category: "PDF & Word Documents",
    icon: FileText,
    badgeColor: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20",
    description: "Full-text extraction, page-level indexing, and scanned OCR recognition.",
    extensions: [
      { ext: ".pdf", label: "Adobe PDF (Text & Scanned OCR)" },
      { ext: ".docx", label: "Microsoft Word (2007+)" },
      { ext: ".doc", label: "Legacy Word" },
    ],
  },
  {
    category: "Spreadsheets & Presentations",
    icon: Table,
    badgeColor: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
    description: "Sheet-by-sheet data extraction, cell content parsing, and slide-level indexing.",
    extensions: [
      { ext: ".xlsx", label: "Excel Spreadsheet" },
      { ext: ".xls", label: "Legacy Excel" },
      { ext: ".csv", label: "Comma-Separated Values" },
      { ext: ".tsv", label: "Tab-Separated Values" },
      { ext: ".pptx", label: "PowerPoint Presentation" },
    ],
  },
  {
    category: "Code & Developer Files",
    icon: Code,
    badgeColor: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
    description: "Syntax-aware line-by-line matching with exact line numbers and code snippets.",
    extensions: [
      { ext: ".js / .jsx", label: "JavaScript & React" },
      { ext: ".ts / .tsx", label: "TypeScript & Next.js" },
      { ext: ".py", label: "Python Source" },
      { ext: ".java", label: "Java Source" },
      { ext: ".cpp / .c", label: "C & C++ Code" },
      { ext: ".html / .css", label: "Web Markup & Styles" },
      { ext: ".json / .xml", label: "Data Structures" },
      { ext: ".yaml / .yml", label: "Config & Pipelines" },
      { ext: ".sql", label: "Database Queries" },
    ],
  },
  {
    category: "Text & Notes",
    icon: Layers,
    badgeColor: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
    description: "Fast multi-keyword and regex search across notes, readmes, and logs.",
    extensions: [
      { ext: ".txt", label: "Plain Text" },
      { ext: ".md", label: "Markdown Documentation" },
      { ext: ".log", label: "System & App Logs" },
      { ext: ".rtf", label: "Rich Text Format" },
    ],
  },
]

export function SupportedFileTypesBanner() {
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <Card className="border border-border/70 bg-gradient-to-r from-card via-card/90 to-card shadow-sm mb-6 overflow-hidden">
      <CardContent className="p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-border/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400">
              <ScanText className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-semibold tracking-tight">
                  Universal File Support Engine
                </h3>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 font-medium">
                  <CheckCircle2 className="h-2.5 w-2.5 mr-1" />
                  Auto-Detects All Formats
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Drop any folder or mixed files. The system automatically selects the right parser (PDF, Word, Excel, PowerPoint, Code, Text & OCR).
              </p>
            </div>
          </div>

          <Button
            variant="ghost"
            size="sm"
            className="text-xs h-8 text-muted-foreground hover:text-foreground shrink-0"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? (
              <>
                <ChevronUp className="h-3.5 w-3.5 mr-1" /> Hide Details
              </>
            ) : (
              <>
                <ChevronDown className="h-3.5 w-3.5 mr-1" /> View 20+ Supported Formats
              </>
            )}
          </Button>
        </div>

        {/* Quick Format Pills (Always Visible) */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-medium text-muted-foreground mr-1">Supported:</span>
          {["PDF", "DOCX", "PPTX", "XLSX", "CSV", "TXT", "MD", "JSON", "JS/TS", "PY", "JAVA", "HTML/CSS", "SQL"].map((fmt) => (
            <Badge
              key={fmt}
              variant="secondary"
              className="text-[11px] font-mono font-medium px-2 py-0.5 bg-muted hover:bg-muted/80 text-foreground/80"
            >
              .{fmt.toLowerCase()}
            </Badge>
          ))}
          <Badge
            variant="outline"
            className="text-[11px] px-2 py-0.5 border-purple-500/30 text-purple-600 dark:text-purple-400 bg-purple-500/5 font-medium"
          >
            <Sparkles className="h-3 w-3 mr-1" /> + OCR for Scanned PDFs
          </Badge>
        </div>

        {/* Expanded Detailed Grid */}
        {isExpanded && (
          <div className="mt-4 pt-3 border-t border-border/40 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 animate-in fade-in-50 duration-200">
            {FILE_CATEGORY_SPECS.map((spec) => {
              const IconComponent = spec.icon
              return (
                <div
                  key={spec.category}
                  className="rounded-lg border border-border/60 p-3 bg-background/50 hover:bg-background transition-colors flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className={`p-1.5 rounded-md border ${spec.badgeColor}`}>
                        <IconComponent className="h-4 w-4" />
                      </div>
                      <h4 className="text-xs font-semibold">{spec.category}</h4>
                    </div>
                    <p className="text-[11px] text-muted-foreground mb-2.5 leading-relaxed">
                      {spec.description}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {spec.extensions.map((e) => (
                      <span
                        key={e.ext}
                        title={e.label}
                        className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border/40"
                      >
                        {e.ext}
                      </span>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
