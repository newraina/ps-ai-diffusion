import React from 'react'
import ReactDOM from 'react-dom/client'
import { Theme } from '@swc-react/theme'
import App from './app'
import './index.css'

// Required for SWC components in UXP
;(window as unknown as { React: typeof React }).React = React

const root = document.getElementById('root')
if (!root) throw new Error('Root element not found')

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <Theme theme="spectrum" scale="medium" color="dark">
      <App />
    </Theme>
  </React.StrictMode>,
)
