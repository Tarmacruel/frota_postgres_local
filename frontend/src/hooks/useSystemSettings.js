import { useContext } from 'react'
import { SystemSettingsContext } from '../context/systemSettingsStore'

export function useSystemSettings() { return useContext(SystemSettingsContext) }
