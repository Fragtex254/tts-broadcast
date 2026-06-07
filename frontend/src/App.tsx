import { useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { Sidebar } from './components/Layout/Sidebar'
import { Dashboard } from './pages/Dashboard'
import { History } from './pages/History'
import { Settings } from './pages/Settings'
import useStore from './store'

function App() {
  const fetchSettings = useStore((s) => s.fetchSettings)

  useEffect(() => {
    fetchSettings()
  }, [])

  return (
    <Router>
      <div className="flex h-screen bg-paper text-ink overflow-hidden">
        {/* 侧边栏 */}
        <Sidebar />

        {/* 主内容区域 */}
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/history" element={<History />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </div>
    </Router>
  )
}

export default App
