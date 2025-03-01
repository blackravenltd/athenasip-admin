import { useReducer } from 'react'

export default function useComponentState(initialState) {
  return useReducer((o, n) => ({ ...o, ...n }), initialState)
}
