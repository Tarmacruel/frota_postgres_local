import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'

const savedTheme = window.localStorage.getItem('frota-theme') === 'dark' ? 'dark' : 'light'
document.documentElement.dataset.theme = savedTheme

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
