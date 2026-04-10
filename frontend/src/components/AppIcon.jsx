export function AppIcon({ name, className }) {
  const commonProps = {
    className,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: '1.9',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': 'true',
  }

  switch (name) {
    case 'dashboard':
      return (
        <svg {...commonProps}>
          <rect x="3.5" y="3.5" width="7" height="7" rx="1.6" />
          <rect x="13.5" y="3.5" width="7" height="5" rx="1.6" />
          <rect x="13.5" y="11.5" width="7" height="9" rx="1.6" />
          <rect x="3.5" y="13.5" width="7" height="7" rx="1.6" />
        </svg>
      )
    case 'vehicles':
      return (
        <svg {...commonProps}>
          <path d="M5 15.5v-3.1a2 2 0 0 1 .22-.92l1.38-2.76A2 2 0 0 1 8.39 7.6h7.22a2 2 0 0 1 1.79 1.12l1.38 2.76c.14.28.22.59.22.92v3.1" />
          <path d="M5 15.5h14" />
          <circle cx="8.5" cy="16.8" r="1.7" />
          <circle cx="15.5" cy="16.8" r="1.7" />
        </svg>
      )
    case 'maintenance':
      return (
        <svg {...commonProps}>
          <path d="m14.5 6.5 3 3" />
          <path d="m10 18 7.5-7.5a2.12 2.12 0 1 0-3-3L7 15l-1 4Z" />
          <path d="M13 7 6.5 13.5" />
        </svg>
      )
    case 'drivers':
      return (
        <svg {...commonProps}>
          <circle cx="9" cy="8" r="3" />
          <path d="M4.5 18a4.5 4.5 0 0 1 9 0" />
          <path d="M16 8h4" />
          <path d="M18 6v4" />
        </svg>
      )
    case 'users':
      return (
        <svg {...commonProps}>
          <circle cx="8.5" cy="8.5" r="3" />
          <path d="M3.5 18a5 5 0 0 1 10 0" />
          <circle cx="17" cy="9" r="2.2" />
          <path d="M14.8 17.4a4 4 0 0 1 4.4-2.8 4 4 0 0 1 2.3 1.4" />
        </svg>
      )
    case 'audit':
      return (
        <svg {...commonProps}>
          <path d="M12 3.5 5.5 6v5.2c0 4 2.75 7.64 6.5 8.8 3.75-1.16 6.5-4.8 6.5-8.8V6L12 3.5Z" />
          <path d="m9.2 11.8 1.9 1.9 3.7-4.1" />
        </svg>
      )
    case 'search':
      return (
        <svg {...commonProps}>
          <circle cx="11" cy="11" r="6.2" />
          <path d="m19 19-3.4-3.4" />
        </svg>
      )
    case 'menu':
      return (
        <svg {...commonProps}>
          <path d="M4 7h16" />
          <path d="M4 12h16" />
          <path d="M4 17h16" />
        </svg>
      )
    case 'panel-open':
      return (
        <svg {...commonProps}>
          <rect x="3.5" y="4" width="17" height="16" rx="2.2" />
          <path d="M8 4v16" />
          <path d="m13 12 3 3" />
          <path d="m13 12 3-3" />
        </svg>
      )
    case 'panel-close':
      return (
        <svg {...commonProps}>
          <rect x="3.5" y="4" width="17" height="16" rx="2.2" />
          <path d="M16 4v16" />
          <path d="m11 12 3 3" />
          <path d="m11 12 3-3" />
        </svg>
      )
    case 'sun':
      return (
        <svg {...commonProps}>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2.8v2.1" />
          <path d="M12 19.1v2.1" />
          <path d="m4.9 4.9 1.5 1.5" />
          <path d="m17.6 17.6 1.5 1.5" />
          <path d="M2.8 12h2.1" />
          <path d="M19.1 12h2.1" />
          <path d="m4.9 19.1 1.5-1.5" />
          <path d="m17.6 6.4 1.5-1.5" />
        </svg>
      )
    case 'moon':
      return (
        <svg {...commonProps}>
          <path d="M18.5 14.2A6.8 6.8 0 0 1 9.8 5.5a7.4 7.4 0 1 0 8.7 8.7Z" />
        </svg>
      )
    case 'logout':
      return (
        <svg {...commonProps}>
          <path d="M14 7.5V5.8A2.3 2.3 0 0 0 11.7 3.5H6.8a2.3 2.3 0 0 0-2.3 2.3v12.4a2.3 2.3 0 0 0 2.3 2.3h4.9a2.3 2.3 0 0 0 2.3-2.3v-1.7" />
          <path d="M10.5 12h9" />
          <path d="m16.5 8 3.5 4-3.5 4" />
        </svg>
      )
    case 'chevron-right':
      return (
        <svg {...commonProps}>
          <path d="m9 6 6 6-6 6" />
        </svg>
      )
    case 'chevron-down':
      return (
        <svg {...commonProps}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      )
    case 'chevron-up':
      return (
        <svg {...commonProps}>
          <path d="m6 15 6-6 6 6" />
        </svg>
      )
    case 'catalog':
      return (
        <svg {...commonProps}>
          <rect x="4" y="4" width="16" height="16" rx="2.6" />
          <path d="M8 8h8" />
          <path d="M8 12h8" />
          <path d="M8 16h5" />
        </svg>
      )
    case 'spark':
      return (
        <svg {...commonProps}>
          <path d="M12 3.5 13.7 8l4.8 1.8-4.8 1.8L12 16l-1.7-4.4-4.8-1.8L10.3 8 12 3.5Z" />
        </svg>
      )
    case 'close':
      return (
        <svg {...commonProps}>
          <path d="m6 6 12 12" />
          <path d="M18 6 6 18" />
        </svg>
      )
    default:
      return null
  }
}

export function getInitials(name) {
  return (name || 'PMTF')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}
