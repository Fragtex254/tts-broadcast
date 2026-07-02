import { useEffect, Suspense, lazy } from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { Sidebar } from './components/Layout/Sidebar'
import { ErrorBoundary } from './components/ErrorBoundary'
import { SourceCollection } from './pages/SourceCollection'
import useStore from './store'

// 代码分割：非首屏路由懒加载
const ScriptEditor = lazy(() => import('./pages/ScriptEditor').then(m => ({ default: m.ScriptEditor })))
const Transcribe = lazy(() => import('./pages/Transcribe').then(m => ({ default: m.Transcribe })))
const History = lazy(() => import('./pages/History').then(m => ({ default: m.History })))
const Settings = lazy(() => import('./pages/Settings').then(m => ({ default: m.Settings })))
const NotFound = lazy(() => import('./pages/NotFound').then(m => ({ default: m.NotFound })))

/** 路由加载占位 */
const PageLoader: React.FC = () => (
  <div className="flex-1 flex items-center justify-center bg-paper">
    <div className="flex flex-col items-center gap-3">
      <div className="w-6 h-6 border-2 border-ink/10 border-t-pink rounded-full animate-spin" />
      <span className="font-body text-[12px] text-ink-soft/70">加载中...</span>
    </div>
  </div>
)

function App() {
  const fetchSettings = useStore((s) => s.fetchSettings)

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

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
