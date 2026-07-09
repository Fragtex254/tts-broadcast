import { useEffect, Suspense, lazy } from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { Sidebar } from './components/Layout/Sidebar'
import { ErrorBoundary } from './components/ErrorBoundary'
import { SourceCollection } from './pages/SourceCollection'
import useStore from './store'

// 代码分割：非首屏路由懒加载
const ScriptEditor = lazy(() => import('./pages/ScriptEditor').then(m => ({ default: m.ScriptEditor })))
const VoicePresets = lazy(() => import('./pages/VoicePresets').then(m => ({ default: m.VoicePresets })))
const Transcribe = lazy(() => import('./pages/Transcribe').then(m => ({ default: m.Transcribe })))
const History = lazy(() => import('./pages/History').then(m => ({ default: m.History })))
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

function App() {
  const fetchSettings = useStore((s) => s.fetchSettings)
  const uiFontPreset = useStore((s) => s.settings.ui_font_preset)
  const uiFontScale = useStore((s) => s.settings.ui_font_scale)

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  useEffect(() => {
    document.documentElement.dataset.uiFontPreset = uiFontPreset
    document.documentElement.dataset.uiFontScale = uiFontScale
  }, [uiFontPreset, uiFontScale])

  return (
    <Router>
      <div className="flex h-screen bg-paper text-ink overflow-hidden">
        {/* 侧边栏 */}
        <Sidebar />

        {/* 主内容区域 */}
        <ErrorBoundary>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<SourceCollection />} />
              <Route path="/editor" element={<ScriptEditor />} />
              <Route path="/voice-presets" element={<VoicePresets />} />
              <Route path="/transcribe" element={<Transcribe />} />
              <Route path="/history" element={<History />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </div>
    </Router>
  )
}

export default App
