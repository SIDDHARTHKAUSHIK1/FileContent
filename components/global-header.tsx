"use client"

import React from "react"
import { Sparkles, Search, Moon, Sun, Layers } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

export type ToolType = "unified" | "ai" | null

interface GlobalHeaderProps {
  currentTool?: ToolType
  onSelectTool?: (tool: ToolType) => void
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
        <div
          className="flex items-center gap-3 cursor-pointer select-none"
          onClick={() => onSelectTool && onSelectTool(null)}
        >
          <div className="p-2 bg-gradient-to-tr from-blue-600 via-indigo-600 to-purple-600 text-white rounded-xl shadow-md flex items-center justify-center">
            <Search className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-base tracking-tight">File Content Tracker</span>
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 py-0 border-purple-500/30 text-purple-600 dark:text-purple-400 bg-purple-500/10 font-medium"
              >
                All-in-One AI
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground hidden sm:block">
              Universal Document Search & Intelligence
            </p>
          </div>
        </div>

        {/* Center / Right Controls */}
        <div className="flex items-center gap-2">
          <Badge
            variant="secondary"
            className="hidden lg:flex items-center gap-1.5 text-xs font-normal py-1 px-2.5 bg-muted/60"
          >
            <Layers className="h-3.5 w-3.5 text-purple-500" />
            <span>PDF • Word • Excel • PPTX • Code • Text</span>
          </Badge>

          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-lg"
            onClick={toggleTheme}
            aria-label="Toggle theme"
          >
            {darkMode ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4 text-slate-600" />}
          </Button>
        </div>
      </div>
    </header>
  )
}
