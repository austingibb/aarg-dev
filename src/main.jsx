import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import WidgetRoutes from './widgets/WidgetRoutes.jsx'
import { MetricsProvider } from './MetricsProvider.jsx'
import { AuthProvider } from './AuthProvider.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <MetricsProvider>
          <WidgetRoutes />
        </MetricsProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
