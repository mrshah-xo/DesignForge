'use client'

export function Footer() {
  return (
    <footer className="mt-auto border-t border-border bg-muted/60 pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto flex w-full max-w-7xl flex-col items-center justify-between gap-1 px-4 py-4 text-xs text-muted-foreground sm:flex-row">
        <p className="font-medium">MrDesign.md</p>
        <p className="text-gray-400 dark:text-gray-500">
          DESIGN.md · tokens · preview assets · metadata
        </p>
      </div>
    </footer>
  )
}
