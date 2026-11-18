'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { toast } from 'sonner'
import { Loader2, Plus } from 'lucide-react'

import { api } from '@/lib/client/api'
import { STEPS } from '@/lib/types'
import type {
  AudienceData,
  DesignTokens,
  ProjectDetail,
  ProjectSummary,
  ResearchSections,
  ResearchSource,
} from '@/lib/types'

import { Header } from '@/components/wizard/header'
import { Footer } from '@/components/wizard/footer'
import { Stepper, type StepStatus } from '@/components/wizard/stepper'
import { Landing } from '@/components/wizard/landing'
import { LogoThumb } from '@/components/wizard/logo-thumb'
import { StatusBadge } from '@/components/wizard/status-badge'
import { UploadStep } from '@/components/steps/upload-step'
import { AnalysisStep } from '@/components/steps/analysis-step'
import { AudienceStep } from '@/components/steps/audience-step'
import { ResearchStep } from '@/components/steps/research-step'
import { MatchStep } from '@/components/steps/match-step'
import { DesignStep } from '@/components/steps/design-step'
import { ExportStep } from '@/components/steps/export-step'

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong'
}

/** Derive a canonical status for a fully loaded project. */
function detailStatusLabel(p: ProjectDetail): string {
  if (p.design) return 'designed'
  if (p.research?.status === 'approved') return 'approved'
  if (p.research) return 'needs_review'
  if (p.audience) return 'audience'
  if (p.analysis) return 'analyzed'
  return 'created'
}

/** Where should a resumed project land? First incomplete step. */
function resumeStep(p: ProjectDetail): number {
  if (!p.analysis) return 2
  if (!p.audience) return 3
  if (!p.research || p.research.status !== 'approved' || !p.design) return 4
  return 7
}

export function WizardShell() {
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [project, setProject] = useState<ProjectDetail | null>(null)
  const [currentStep, setCurrentStep] = useState(1)
  // Audience fields parsed from the landing-page agent brief ("Want a prompt?").
  // Held here until step 3 mounts, then cleared once saved (or on new project).
  const [pendingAudience, setPendingAudience] = useState<Partial<AudienceData> | null>(null)

  const [loadingProjects, setLoadingProjects] = useState(true)
  const [loadingProject, setLoadingProject] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [savingAudience, setSavingAudience] = useState(false)
  const [researching, setResearching] = useState(false)
  const [savingEdits, setSavingEdits] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [savingDesign, setSavingDesign] = useState(false)
  // Nonces force step remounts when server data is replaced wholesale
  // (regenerated research / design), so editors re-initialize cleanly.
  const [researchNonce, setResearchNonce] = useState(0)
  const [designNonce, setDesignNonce] = useState(0)

  // Browser tab title follows the current wizard section: "Design Forge" on
  // the landing screen, then the active section label (e.g. "Research review")
  // as the user navigates through the steps.
  useEffect(() => {
    document.title = project
      ? STEPS.find((s) => s.id === currentStep)?.label ?? 'Design Forge'
      : 'Design Forge'
  }, [project, currentStep])

  // ---------------- Data loading ----------------
  const refreshProjects = useCallback(async () => {
    try {
      const list = await api.listProjects()
      setProjects(list)
    } catch (err) {
      // Non-fatal: the wizard still works without the recent-projects list.
      console.warn('Could not load projects:', err)
    } finally {
      setLoadingProjects(false)
    }
  }, [])

  useEffect(() => {
    void refreshProjects()
  }, [refreshProjects])

  const refresh = useCallback(async (id: string) => {
    try {
      const detail = await api.getProject(id)
      setProject((p) => (p && p.id === id ? detail : p))
    } catch (err) {
      console.warn('Could not refresh project:', err)
    }
  }, [])

  // ---------------- Landing: create + analyze ----------------
  const handleStart = useCallback(
    async (file: File, name: string, description: string) => {
      setAnalyzing(false)
      let createdId: string | null = null
      try {
        const form = new FormData()
        form.append('file', file)
        form.append('name', name)
        if (description) form.append('description', description)
        const created = await api.createProject(form)
        createdId = created.id
        setProject({ ...created, analysis: null, audience: null, research: null, design: null })
        void refreshProjects()
      } catch (err) {
        toast.error('Could not create project', { description: errMsg(err) })
        return
      }

      setAnalyzing(true)
      try {
        const analysis = await api.analyzeProject(createdId)
        setProject((p) => (p && p.id === createdId ? { ...p, analysis } : p))
        await refresh(createdId)
        setCurrentStep(2)
        toast.success('Logo analysis ready', {
          description: 'Review the extracted DNA, then tell us who will use it.',
        })
      } catch (err) {
        setCurrentStep(2)
        toast.error('AI analysis failed', {
          description: `${errMsg(err)} — you can retry from step 2.`,
        })
      } finally {
        setAnalyzing(false)
      }
    },
    [refresh, refreshProjects]
  )

  // ---------------- Step 2: analysis ----------------
  const runAnalysis = useCallback(async () => {
    if (!project) return
    const id = project.id
    setAnalyzing(true)
    try {
      const analysis = await api.analyzeProject(id)
      setProject((p) => (p && p.id === id ? { ...p, analysis } : p))
      await refresh(id)
      toast.success('Analysis complete')
    } catch (err) {
      toast.error('AI analysis failed', { description: errMsg(err) })
    } finally {
      setAnalyzing(false)
    }
  }, [project, refresh])

  // ---------------- Step 3: audience ----------------
  const saveAudience = useCallback(
    async (audience: AudienceData) => {
      if (!project) return
      const id = project.id
      setSavingAudience(true)
      try {
        const saved = await api.saveAudience(id, audience)
        setProject((p) => (p && p.id === id ? { ...p, audience: saved } : p))
        await refresh(id)
        setCurrentStep(4)
        toast.success('Audience saved', {
          description: 'Research will target exactly this audience.',
        })
      } catch (err) {
        toast.error('Could not save audience', { description: errMsg(err) })
      } finally {
        setSavingAudience(false)
        setPendingAudience(null)
      }
    },
    [project, refresh]
  )

  // ---------------- Step 4: research ----------------
  const runResearch = useCallback(async () => {
    if (!project) return
    const id = project.id
    setResearching(true)
    try {
      const research = await api.runResearch(id)
      setProject((p) => (p && p.id === id ? { ...p, research } : p))
      setResearchNonce((n) => n + 1)
      await refresh(id)
      toast.success('Research ready for your review')
    } catch (err) {
      toast.error('Research failed', { description: errMsg(err) })
    } finally {
      setResearching(false)
    }
  }, [project, refresh])

  const saveResearchEdits = useCallback(
    async (payload: { sections: ResearchSections; sources: ResearchSource[] }) => {
      if (!project) return
      const id = project.id
      setSavingEdits(true)
      try {
        const research = await api.saveResearch(id, { ...payload, approve: false })
        setProject((p) => (p && p.id === id ? { ...p, research } : p))
        setResearchNonce((n) => n + 1)
        await refresh(id)
        toast.success('Edits saved')
      } catch (err) {
        toast.error('Could not save edits', { description: errMsg(err) })
      } finally {
        setSavingEdits(false)
      }
    },
    [project, refresh]
  )

  const generateDesign = useCallback(
    async (advanceToMatch: boolean) => {
      if (!project) return
      const id = project.id
      setGenerating(true)
      try {
        const design = await api.generateDesign(id)
        setProject((p) => (p && p.id === id ? { ...p, design } : p))
        setDesignNonce((n) => n + 1)
        await refresh(id)
        if (advanceToMatch) setCurrentStep(5)
        toast.success('Design system generated')
      } catch (err) {
        toast.error('Could not generate design', { description: errMsg(err) })
      } finally {
        setGenerating(false)
      }
    },
    [project, refresh]
  )

  const approveAndGenerate = useCallback(
    async (payload: { sections: ResearchSections; sources: ResearchSource[] }) => {
      if (!project) return
      const id = project.id
      setGenerating(true)
      try {
        const research = await api.saveResearch(id, { ...payload, approve: true })
        setProject((p) => (p && p.id === id ? { ...p, research } : p))
        const design = await api.generateDesign(id)
        setProject((p) => (p && p.id === id ? { ...p, design } : p))
        setDesignNonce((n) => n + 1)
        await refresh(id)
        setCurrentStep(5)
        toast.success('Design system generated')
      } catch (err) {
        toast.error('Could not generate design', { description: errMsg(err) })
      } finally {
        setGenerating(false)
      }
    },
    [project, refresh]
  )

  // ---------------- Step 6: design ----------------
  const saveDesignTokens = useCallback(
    async (tokens: DesignTokens) => {
      if (!project) return
      const id = project.id
      setSavingDesign(true)
      try {
        const design = await api.saveDesign(id, { tokens })
        setProject((p) => (p && p.id === id ? { ...p, design } : p))
        await refresh(id)
        toast.success('Design saved')
      } catch (err) {
        toast.error('Could not save design', { description: errMsg(err) })
      } finally {
        setSavingDesign(false)
      }
    },
    [project, refresh]
  )

  const saveDesignMarkdown = useCallback(
    async (markdown: string) => {
      if (!project) return
      const id = project.id
      setSavingDesign(true)
      try {
        const design = await api.saveDesign(id, { markdown })
        setProject((p) => (p && p.id === id ? { ...p, design } : p))
        await refresh(id)
        toast.success('DESIGN.md saved')
      } catch (err) {
        toast.error('Could not save DESIGN.md', { description: errMsg(err) })
      } finally {
        setSavingDesign(false)
      }
    },
    [project, refresh]
  )

  // ---------------- Project navigation ----------------
  const openProject = useCallback(
    async (id: string) => {
      setLoadingProject(true)
      try {
        const detail = await api.getProject(id)
        setProject(detail)
        setCurrentStep(resumeStep(detail))
        void refreshProjects()
      } catch (err) {
        toast.error('Could not open project', { description: errMsg(err) })
      } finally {
        setLoadingProject(false)
      }
    },
    [refreshProjects]
  )

  const startNew = useCallback(() => {
    setProject(null)
    setCurrentStep(1)
    setAnalyzing(false)
    setPendingAudience(null)
    void refreshProjects()
    window.scrollTo({ top: 0 })
  }, [refreshProjects])

  // ---------------- Derived step state ----------------
  const stepState = useMemo<Record<number, StepStatus>>(() => {
    const hasAnalysis = !!project?.analysis
    const hasAudience = !!project?.audience
    const hasApprovedResearch = project?.research?.status === 'approved'
    const hasDesign = !!project?.design
    return {
      1: project ? 'done' : 'locked',
      2: project ? (hasAnalysis ? 'done' : 'current') : 'locked',
      3: hasAnalysis ? (hasAudience ? 'done' : 'current') : 'locked',
      4: hasAudience ? (hasApprovedResearch && hasDesign ? 'done' : 'current') : 'locked',
      5: hasDesign ? 'done' : 'locked',
      6: hasDesign ? 'done' : 'locked',
      7: hasDesign ? 'current' : 'locked',
    }
  }, [project])

  const handleSelectStep = useCallback(
    (id: number) => {
      if ((stepState[id] ?? 'locked') === 'locked') return
      setCurrentStep(id)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    },
    [stepState]
  )

  // ---------------- Step renderer ----------------
  const renderStep = () => {
    if (!project) return null
    switch (currentStep) {
      case 1:
        return (
          <UploadStep
            key={`upload-${project.id}`}
            project={project}
            busy={analyzing}
            onReplace={handleStart}
          />
        )
      case 2:
        return (
          <AnalysisStep
            key={`analysis-${project.id}`}
            project={project}
            analyzing={analyzing}
            onRunAnalysis={runAnalysis}
            onContinue={() => handleSelectStep(3)}
          />
        )
      case 3:
        return (
          <AudienceStep
            key={`audience-${project.id}`}
            project={project}
            saving={savingAudience}
            prefill={pendingAudience}
            onSave={saveAudience}
          />
        )
      case 4:
        return (
          <ResearchStep
            key={`research-${project.id}-${researchNonce}`}
            project={project}
            researching={researching}
            generating={generating}
            savingEdits={savingEdits}
            approving={generating}
            onRunResearch={runResearch}
            onSaveEdits={saveResearchEdits}
            onApproveAndGenerate={approveAndGenerate}
            onGenerateDesign={() => generateDesign(true)}
            onOpenDesign={() => handleSelectStep(6)}
          />
        )
      case 5:
        return project.design ? (
          <MatchStep design={project.design} onContinue={() => handleSelectStep(6)} />
        ) : (
          <p className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground shadow-sm">
            Generate the design system in step 4 to see the fit report.
          </p>
        )
      case 6:
        return (
          <DesignStep
            key={`design-${project.id}-${designNonce}`}
            project={project}
            saving={savingDesign}
            generating={generating}
            onSaveTokens={saveDesignTokens}
            onSaveMarkdown={saveDesignMarkdown}
            onRegenerate={() => generateDesign(false)}
          />
        )
      case 7:
        return <ExportStep key={`export-${project.id}`} project={project} onStartNew={startNew} />
      default:
        return null
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header
        projects={projects}
        loadingProjects={loadingProjects}
        onOpenProject={(id) => void openProject(id)}
        onNewProject={startNew}
      />

      <main className="flex-1">
        {project === null ? (
          <Landing
            analyzing={analyzing}
            onStart={handleStart}
            onAudiencePrefill={setPendingAudience}
            audiencePrefilled={pendingAudience !== null}
          />
        ) : (
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 lg:flex-row lg:gap-8">
            {/* Stepper: horizontal pills on mobile, sticky rail on lg+ */}
            <aside className="shrink-0 lg:sticky lg:top-24 lg:h-fit lg:w-64">
              <Stepper currentStep={currentStep} stepState={stepState} onSelect={handleSelectStep} />
            </aside>

            <section className="min-w-0 flex-1" aria-label="Wizard content">
              <div className="mx-auto max-w-5xl">
                {/* Project strip */}
                <div className="mb-6 flex items-center gap-3 rounded-lg border border-border bg-card p-4 shadow-sm">
                  <LogoThumb
                    src={project.logoDataUrl}
                    name={project.name}
                    size={40}
                    className="rounded-lg"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-50">
                        {project.name}
                      </p>
                      <StatusBadge status={detailStatusLabel(project)} />
                    </div>
                    {project.description && (
                      <p className="truncate text-xs text-muted-foreground">{project.description}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={startNew}
                    className="flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
                  >
                    <Plus className="size-3.5" />
                    New project
                  </button>
                </div>

                {loadingProject ? (
                  <div className="flex items-center justify-center gap-2 rounded-lg border border-border bg-card p-12 text-sm text-muted-foreground shadow-sm">
                    <Loader2 className="size-4 animate-spin" />
                    Loading project…
                  </div>
                ) : (
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.div
                      key={currentStep}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.2, ease: 'easeOut' }}
                    >
                      {renderStep()}
                    </motion.div>
                  </AnimatePresence>
                )}
              </div>
            </section>
          </div>
        )}
      </main>

      <Footer />
    </div>
  )
}
