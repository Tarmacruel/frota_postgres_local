import { useSystemSettings } from '../hooks/useSystemSettings'
import { activeSeasonalTheme } from '../utils/systemBranding'

const bulbColors = ['amber', 'wine', 'sage', 'amber', 'sage', 'wine', 'amber']
const sections = [null, 'champagne', null, 'wine', null, 'champagne', null]

export default function ChristmasFestoon({ className = '', compact = false }) {
  return (
    <div className={`christmas-festoon ${className}`.trim()} data-compact={compact || undefined} aria-hidden="true">
      <div className="christmas-festoon__strand">
        {sections.map((ornament, section) => (
          <span className="christmas-festoon__section" key={section}>
            {bulbColors.map((_, index) => (
              <span className="christmas-festoon__bulb" data-color={bulbColors[(index + section * 2) % bulbColors.length]} key={index} />
            ))}
            {ornament && <span className="christmas-festoon__ornament" data-color={ornament} />}
          </span>
        ))}
      </div>
    </div>
  )
}

export function PublishedChristmasFestoon({ className }) {
  const { seasonal_theme } = useSystemSettings()
  if (activeSeasonalTheme(seasonal_theme)?.id !== 'christmas') return null
  return <ChristmasFestoon className={className} />
}
