import { createContext } from 'react'
import { initialSettings } from '../utils/systemBranding'

export const SystemSettingsContext = createContext({ values: initialSettings, revision: 0, reload: async () => {}, publish: () => {} })
