import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'
import './styles-light.css'
import './styles/frontend-evolution.css'
import './styles/analytics-evolution.css'
import './styles/fuel-alerts.css'
import './styles/mobile-experience.css'
import './styles/navigation.css'
import './styles/kpi-tones.css'
import './styles/operation-workspaces.css'
import './styles/guided-forms.css'
import './styles/system-settings.css'
import { SystemSettingsProvider } from './context/SystemSettingsContext'

const savedTheme = window.localStorage.getItem('frota-theme') === 'dark' ? 'dark' : 'light'
document.documentElement.dataset.theme = savedTheme

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <SystemSettingsProvider><App /></SystemSettingsProvider>
  </React.StrictMode>,
)
