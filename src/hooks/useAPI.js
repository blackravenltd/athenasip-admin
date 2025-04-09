import API from '../lib/API'

const api = new API({
  fetch: fetch,
  apiUrl: process.env.REACT_APP_API_URL
})

export default function useAPI() {
  return api
}
