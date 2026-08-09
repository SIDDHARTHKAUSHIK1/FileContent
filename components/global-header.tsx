"use client"

import React from "react"
import { Sparkles, Search, FileText, Code, Moon, Sun, ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

export type ToolType = "multi" | "word" | "pptx" | "pdf" | "ai" | null

interface GlobalHeaderProps {
  currentTool: ToolType
  onSelectTool: (tool: ToolType) => void
  onBackToHome?: () => void
}

export function GlobalHeader({ currentTool, onSelectTool, onBackToHome }: GlobalHeaderProps) {
  const [darkMode, setDarkMode] = React.useState(false)

  React.useEffect(() => {
    const isDark = document.documentElement.classList.contains("dark")
    setDarkMode(isDark)
  }, [])

  const toggleTheme = () => {
    const nextDark = !darkMode
    setDarkMode(nextDark)
    if (nextDark) {
      document.documentElement.classList.add("dark")
    } else {
      document.documentElement.classList.remove("dark")
    }
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between gap-4">
        {/* Left: Brand Logo & Title */}
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => onSelectTool(null)}>
          <div className="p-2 bg-gradient-to-tr from-blue-600 to-purple-600 text-white rounded-xl shadow-md flex items-center justify-center">
            <Search className="h-5 w-5" />
          </div>
          <div className="hidden sm:block">
            <div className="flex items-center gap-2">
              <span className="font-bold text-base tracking-tight">File Content Tracker</span>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-purple-500/30 text-purple-600 dark:text-purple-400 bg-purple-500/10">
                AI RAG
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground">Universal Document & Code Search</p>
          </div>
        </div>

        {/* Center: Quick navigation links */}
        <div className="hidden md:flex items-center gap-1 bg-muted/60 p-1 rounded-lg border">
          <Button
            variant={currentTool === null ? "secondary" : "ghost"}
            size="sm"
            className="h-8 text-xs font-medium"
            onClick={() => onSelectTool(null)}
          >
            All Tools
          </Button>
          <Button
            variant={currentTool === "multi" ? "secondary" : "ghost"}
            size="sm"
            className="h-8 text-xs font-medium"
            onClick={() => onSelectTool("multi")}
          >
            <Code className="h-3.5 w-3.5 mr-1 text-blue-500" />
            Multi-File
          </Button>
          <Button
            variant={currentTool === "word" ? "secondary" : "ghost"}
            size="sm"
            className="h-8 text-xs font-medium"
            onClick={() => onSelectTool("word")}
          >
            <FileText className="h-3.5 w-3.5 mr-1 text-yellow-500" />
            Word
          </Button>
          <Button
            variant={currentTool === "pptx" ? "secondary" : "ghost"}
            size="sm"
            className="h-8 text-xs font-medium"
            onClick={() => onSelectTool("pptx")}
          >
            <span className="mr-1 text-xs">📊</span>
            PPTX / XLSX
          </Button>
          <Button
            variant={currentTool === "pdf" ? "secondary" : "ghost"}
            size="sm"
            className="h-8 text-xs font-medium"
            onClick={() => onSelectTool("pdf")}
          >
            <span className="mr-1 text-xs">📄</span>
            PDF
          </Button>
        </div>

        {/* Right: Fixed AI Assistant Button + Theme Toggle */}
        <div className="flex items-center gap-2">
          <Button
            variant={currentTool === "ai" ? "default" : "outline"}
            size="sm"
            onClick={() => onSelectTool(currentTool === "ai" ? null : "ai")}
            className={`h-9 px-3 text-xs font-semibold rounded-lg transition-all duration-200 shadow-sm flex items-center gap-1.5 ${
              currentTool === "ai"
                ? "bg-gradient-to-r from-purple-600 to-indigo-600 text-white hover:from-purple-700 hover:to-indigo-700 shadow-purple-500/25"
                : "border-purple-500/40 text-purple-600 dark:text-purple-300 hover:bg-purple-500/10 hover:border-purple-500"
            }`}
          >
            <Sparkles className="h-4 w-4 text-purple-500 animate-pulse" />
            <span>AI Document Search</span>
          </Button>

          {currentTool !== null && (
            <Button
              variant="ghost"
              size="sm"
              className="h-9 text-xs"
              onClick={() => (onBackToHome ? onBackToHome() : onSelectTool(null))}
            >
              <ArrowLeft className="h-3.5 w-3.5 mr-1" />
              Back
            </Button>
          )}

          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            onClick={toggleTheme}
            aria-label="Toggle theme"
          >
            {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </header>
  )
}
