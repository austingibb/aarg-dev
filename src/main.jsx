import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import Blog from './Blog.jsx'
import BlogPost from './BlogPost.jsx'
import { MetricsProvider } from './MetricsProvider.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <MetricsProvider>
        <Routes>
          <Route path="/" element={<App />} />
          <Route path="/blog" element={<Blog />} />
          <Route path="/blog/:slug" element={<BlogPost />} />
        </Routes>
      </MetricsProvider>
    </BrowserRouter>
  </StrictMode>,
)
