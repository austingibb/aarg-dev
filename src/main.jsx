import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import Blog from './Blog.jsx'
import BlogPost from './BlogPost.jsx'
import Login from './Login.jsx'
import Clip from './Clip.jsx'
import ClipView from './ClipView.jsx'
import Admin from './Admin.jsx'
import { MetricsProvider } from './MetricsProvider.jsx'
import { AuthProvider } from './AuthProvider.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <MetricsProvider>
          <Routes>
            <Route path="/" element={<App />} />
            <Route path="/blog" element={<Blog />} />
            <Route path="/blog/:slug" element={<BlogPost />} />
            <Route path="/login" element={<Login />} />
            <Route path="/clip" element={<Clip />} />
            <Route path="/clip/:path" element={<ClipView />} />
            <Route path="/admin" element={<Admin />} />
          </Routes>
        </MetricsProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
