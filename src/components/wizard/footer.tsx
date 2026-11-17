'use client'

export function Footer() {
  return (
    <footer className="mt-auto border-t border-zinc-200 bg-background pb-[env(safe-area-inset-bottom)] dark:border-zinc-800">
      <div className="mx-auto flex w-full max-w-7xl flex-col items-center justify-between gap-1 px-4 py-4 text-xs text-muted-foreground sm:flex-row">
        <p className="font-medium">DesignForge — Logo to DESIGN.md</p>
        <p className="text-zinc-400 dark:text-zinc-500">
          DESIGN.md · tokens · preview assets · metadata
        </p>
      </div>
    </footer>
  )
}
