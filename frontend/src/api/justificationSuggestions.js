import api from './client'

export const justificationSuggestionsAPI = {
  list: (context) => api.get('/justification-suggestions', { params: { context } }),
  forget: (id) => api.delete(`/justification-suggestions/${id}`),
}
