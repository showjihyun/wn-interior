import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './presentation/App'
import { createApplicationComposition } from './compositionRoot'
import { AppRuntimeProvider } from './presentation/AppRuntimeContext'
import './presentation/styles.css'

const { runtime } = createApplicationComposition()

if (import.meta.env.DEV || import.meta.env.MODE === 'test') {
  const testBridge = {
    setState: runtime.store.setState,
    subscribe: runtime.store.subscribe,
    getState: () => {
      const state = runtime.store.getState()
      return {
        ...state,
        commit: (mutate: (draft: typeof state) => void) => {
          const draft = {
            ...state,
            plan: structuredClone(state.plan),
            placements: structuredClone(state.placements),
            customProducts: structuredClone(state.customProducts),
          }
          mutate(draft)
          runtime.store.setState(draft)
        },
      }
    },
  }
  ;(window as unknown as Record<string, unknown>).__hp3d_store = testBridge
  ;(window as unknown as Record<string, unknown>).__hp3d_texture_stats = () =>
    runtime.productTextureEngine.stats()
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppRuntimeProvider runtime={runtime}>
      <App />
    </AppRuntimeProvider>
  </React.StrictMode>
)
