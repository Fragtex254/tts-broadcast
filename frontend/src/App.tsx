import { useEffect, Suspense, lazy } from 'react'
import { createBrowserRouter, Outlet, RouterProvider } from 'react-router-dom'
import { Sidebar } from './components/Layout/Sidebar'
import { GlobalTaskProgressBar } from './components/Layout/GlobalTaskProgressBar'
import { ErrorBoundary } from './components/ErrorBoundary'
import { SourceCollection } from './pages/SourceCollection'
import { sseRegistry } from './services/sseRegistry'
import useStore from './store'
import { disposeProjectWorkspaceRuntime } from './store/projectWorkspaceSlice'

// 代码分割：非首屏路由懒加载
const ScriptEditor = lazy(() => import('./pages/ScriptEditor').then(m => ({ default: m.ScriptEditor })))
const VoicePresets = lazy(() => import('./pages/VoicePresets').then(m => ({ default: m.VoicePresets })))
const Transcribe = lazy(() => import('./pages/Transcribe').then(m => ({ default: m.Transcribe })))
const ContentLibrary = lazy(() => import('./pages/ContentLibrary').then(m => ({ default: m.ContentLibrary })))
const TranscriptWorkspace = lazy(() => import('./pages/TranscriptWorkspace').then(m => ({ default: m.TranscriptWorkspace })))
const ProjectWorkspace = lazy(() => import('./pages/ProjectWorkspace').then(m => ({ default: m.ProjectWorkspace })))
const Automation = lazy(() => import('./pages/Automation').then(m => ({ default: m.Automation })))
const Settings = lazy(() => import('./pages/Settings').then(m => ({ default: m.Settings })))
const NotFound = lazy(() => import('./pages/NotFound').then(m => ({ default: m.NotFound })))

/** 路由加载占位 */
const PageLoader: React.FC = () => (
  <div className="flex-1 bg-paper p-6">
    <div className="mx-auto max-w-5xl space-y-4 animate-pulse">
      <div className="h-12 w-56 rounded-2xl bg-ink/5" />
      <div className="rounded-card border border-card-border bg-white/70 p-5 shadow-card">
        <div className="mb-5 h-4 w-32 rounded bg-ink/5" />
        <div className="space-y-3">
          <div className="h-4 w-full rounded bg-ink/5" />
          <div className="h-4 w-4/5 rounded bg-ink/5" />
          <div className="h-4 w-2/3 rounded bg-ink/5" />
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="h-36 rounded-card border border-card-border bg-white/60 shadow-card" />
        <div className="h-36 rounded-card border border-card-border bg-white/60 shadow-card" />
      </div>
    </div>
  </div>
)

function AppLayout() {
  const fetchSettings = useStore((s) => s.fetchSettings)
  const uiFontPreset = useStore((s) => s.settings.ui_font_preset)
  const uiFontScale = useStore((s) => s.settings.ui_font_scale)

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  useEffect(() => () => {
    disposeProjectWorkspaceRuntime()
    sseRegistry.closeAll()
  }, [])

  useEffect(() => {
    document.documentElement.dataset.uiFontPreset = uiFontPreset
    document.documentElement.dataset.uiFontScale = uiFontScale
  }, [uiFontPreset, uiFontScale])

  return (
    <div className="flex h-screen min-w-0 overflow-hidden bg-paper text-ink">
      {/* 侧边栏 */}
      <Sidebar />

      {/* 主内容区域 */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <GlobalTaskProgressBar />
        <ErrorBoundary>
          <Suspense fallback={<PageLoader />}>
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </div>
    </div>
  )
}

const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { index: true, element: <SourceCollection /> },
      { path: 'editor/:broadcastId', element: <ScriptEditor /> },
      { path: 'editor', element: <ScriptEditor /> },
      { path: 'voice-presets', element: <VoicePresets /> },
      { path: 'transcribe', element: <Transcribe /> },
      { path: 'history', element: <ContentLibrary /> },
      { path: 'history/transcriptions/:id', element: <TranscriptWorkspace /> },
      { path: 'projects/:id', element: <ProjectWorkspace /> },
      { path: 'automation', element: <Automation /> },
      { path: 'settings', element: <Settings /> },
      { path: '*', element: <NotFound /> },
    ],
  },
])

function App() {
  return <RouterProvider router={router} />
}

export default App
