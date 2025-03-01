import { createContext, useContext, useReducer } from 'react'

var AppStateContext
const AppStateDispatchContext = createContext(null)

export default function AppStateProvider({ children }) {
  const [appState, dispatch] = useReducer((o, n) => ({ ...o, ...n }), useContext(AppStateContext))

  return (
    <AppStateContext.Provider value={appState}>
      <AppStateDispatchContext.Provider value={dispatch}>
        {children}
      </AppStateDispatchContext.Provider>
    </AppStateContext.Provider>
  )
}

export function initAppState(obj) {
  AppStateContext = createContext(obj)
}

export function useAppState() {
  return [ useContext(AppStateContext), useContext(AppStateDispatchContext) ]
}