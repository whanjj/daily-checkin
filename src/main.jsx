import React from 'react'
import { createRoot } from 'react-dom/client'

function App() {
  return (
    <div style={{ padding: 60, fontSize: 28, lineHeight: 1.6, background: '#fff', color: '#111' }}>
      ✅ 构建成功：你能看到这行字说明 React 已经运行并渲染。
    </div>
  )
}

createRoot(document.getElementById('root')).render(<App />)
