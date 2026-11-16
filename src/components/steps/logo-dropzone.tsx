'use client'

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { motion } from 'framer-motion'
import { ImagePlus, UploadCloud, X } from 'lucide-react'
import { cn } from '@/lib/utils'

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB

interface LogoDropzoneProps {
  file: File | null
  onFile: (file: File | null) => void
  disabled?: boolean
  compact?: boolean
}

/**
 * Drag & drop / click-to-browse image picker.
 * Validates image mime + 5MB max client-side and toasts on violation.
 */
export function LogoDropzone({ file, onFile, disabled = false, compact = false }: LogoDropzoneProps) {
  const [dragging, setDragging] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Object URLs are created/revoked inside event handlers (not effects),
  // and the previous URL is always revoked before a new one is created.
  const confirmFile = (next: File | null) => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(next ? URL.createObjectURL(next) : null)
    onFile(next)
  }

  const accept = (list: FileList | null) => {
    if (disabled) return
    const picked = list?.[0]
    if (!picked) return
    if (!picked.type.startsWith('image/')) {
      toast.error('Unsupported file', {
        description: 'Please choose an image file (PNG, JPG, SVG, WebP…).',
      })
      return
    }
    if (picked.size > MAX_FILE_SIZE) {
      toast.error('File too large', {
        description: 'Logos must be 5MB or smaller.',
      })
      return
    }
    confirmFile(picked)
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        aria-label="Upload logo image"
        onChange={(e) => {
          accept(e.target.files)
          e.target.value = ''
        }}
      />

      {file && previewUrl ? (
        <div
          className={cn(
            'relative flex items-center gap-4 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900',
            compact ? 'p-3' : 'p-4',
          )}
        >
          <img
            src={previewUrl}
            alt="Selected logo preview"
            className={cn(
              'shrink-0 rounded-xl border border-zinc-100 bg-[repeating-conic-gradient(#fafafa_0%_25%,#f4f4f5_0%_50%)] bg-[length:16px_16px] object-contain dark:border-zinc-800',
              compact ? 'size-14' : 'size-20',
            )}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-50">{file.name}</p>
            <p className="text-xs text-muted-foreground">
              {(file.size / 1024).toFixed(0)} KB · {file.type || 'image'}
            </p>
          </div>
          <button
            type="button"
            aria-label="Remove selected file"
            disabled={disabled}
            onClick={() => confirmFile(null)}
            className="flex size-8 shrink-0 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-50 dark:hover:bg-zinc-800"
          >
            <X className="size-4" />
          </button>
        </div>
      ) : (
        <motion.button
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault()
            if (!disabled) setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            accept(e.dataTransfer.files)
          }}
          whileHover={disabled ? undefined : { y: -1 }}
          className={cn(
            'flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed text-center transition-colors',
            compact ? 'p-6' : 'p-8',
            dragging
              ? 'border-emerald-500 bg-emerald-50/60 dark:bg-emerald-500/10'
              : 'border-zinc-300 bg-white hover:border-emerald-400 hover:bg-emerald-50/40 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-emerald-500/60 dark:hover:bg-emerald-500/5',
            disabled && 'cursor-not-allowed opacity-60',
          )}
        >
          <span
            className={cn(
              'flex items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400',
              compact ? 'size-9' : 'size-12',
            )}
          >
            {dragging ? <UploadCloud className="size-5" /> : <ImagePlus className={compact ? 'size-4.5' : 'size-5'} />}
          </span>
          <span className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
            {dragging ? 'Drop your logo here' : 'Drag & drop your logo, or click to browse'}
          </span>
          <span className="text-xs text-muted-foreground">PNG, JPG, SVG or WebP · up to 5MB</span>
        </motion.button>
      )}
    </div>
  )
}
