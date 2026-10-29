import React from 'react'
import {createRoot} from 'react-dom/client'
import './style.css'
import '@fontsource-variable/inter'
import '@fontsource/noto-sans-sc/400.css'
import '@fontsource/noto-sans-sc/500.css'
import '@fontsource/noto-sans-sc/600.css'
import '@fontsource/jetbrains-mono/400.css'
import App from './App'

const container = document.getElementById('root')

const root = createRoot(container!)

root.render(
    <React.StrictMode>
        <App/>
    </React.StrictMode>
)
