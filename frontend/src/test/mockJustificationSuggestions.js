import { vi } from 'vitest'

// Form integration tests exercise selection with the server's fixed catalogue.
// Only tests import the backend source; production builds consume the HTTP API.
vi.mock('../api/justificationSuggestions', async () => {
  const { default: presets } = await import('../../../backend/app/core/justification_presets.json')
  return { justificationSuggestionsAPI: {
    list: (context) => Promise.resolve({ data: { presets: presets[context] || [], history: [] } }),
    forget: () => Promise.resolve({}),
  } }
})
