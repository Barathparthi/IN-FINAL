import './monacoConfig'
import './utils/remoteLogger'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, HashRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import App from './App'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,
      retry: 1,
    },
  },
})

const isElectron = !!(window as any).electronBridge?.isElectron
const Router = isElectron ? HashRouter : BrowserRouter

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <Router>
        <App />
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: '#1e2438',
              color: '#f0f2ff',
              border: '1px solid rgba(99,120,255,0.2)',
              borderRadius: '10px',
              fontSize: '0.875rem',
            },
            success: { iconTheme: { primary: '#10b981', secondary: '#f0f2ff' } },
            error:   { iconTheme: { primary: '#ff4d6d', secondary: '#f0f2ff' } },
          }}
        />
      </Router>
    </QueryClientProvider>
  </React.StrictMode>
)
