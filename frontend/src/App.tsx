import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { Sidebar } from './components/Layout/Sidebar'
import { Dashboard } from './pages/Dashboard'
import { History } from './pages/History'
import { Settings } from './pages/Settings'

function App() {
  return (
    <Router>
      <div className="flex min-h-screen bg-gray-900 text-gray-100">
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
