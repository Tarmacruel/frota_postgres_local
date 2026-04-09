import axios from 'axios'

const baseURL = import.meta.env.VITE_API_BASE_URL?.trim() || '/api'

const api = axios.create({
  baseURL,
  withCredentials: true,
})

export default api
