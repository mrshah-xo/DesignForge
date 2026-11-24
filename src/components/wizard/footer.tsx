'use client'

export function Footer() {
  return (
    <footer className="mt-auto border-t border-border bg-muted/60 pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto w-full max-w-7xl px-4 py-4 text-center">
        {/* Wordmark in the identity font - the footer's only brand moment. */}
        <span className="font-identity text-lg leading-relaxed text-muted-foreground">
          MrDesign.md
        </span>
      </div>
    </footer>
  )
}
