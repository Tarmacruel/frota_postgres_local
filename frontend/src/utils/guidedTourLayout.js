const TOUR_MARGIN = 12
const TOUR_GAP = 14
const SPOTLIGHT_PADDING = 8
const MINIMUM_ANCHORED_DIALOG_WIDTH = 300
const MINIMUM_ANCHORED_DIALOG_HEIGHT = 220

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum))
}

function roundedRect(rect) {
  if (!rect) return null
  return Object.fromEntries(
    Object.entries(rect).map(([key, value]) => [key, Number.isFinite(value) ? Math.round(value) : value]),
  )
}

function buildSpotlightRect(targetRect, viewport) {
  if (!targetRect) return null

  const minimumLeft = viewport.left + TOUR_MARGIN
  const minimumTop = viewport.top + TOUR_MARGIN
  const availableWidth = Math.max(1, viewport.width - (TOUR_MARGIN * 2))
  const availableHeight = Math.max(1, viewport.height - (TOUR_MARGIN * 2))
  const maximumLeft = minimumLeft + availableWidth
  const maximumTop = minimumTop + availableHeight
  const rawWidth = Math.max(1, targetRect.width || targetRect.right - targetRect.left) + (SPOTLIGHT_PADDING * 2)
  const rawHeight = Math.max(1, targetRect.height || targetRect.bottom - targetRect.top) + (SPOTLIGHT_PADDING * 2)
  const width = Math.min(rawWidth, availableWidth)
  const maximumSpotlightHeight = Math.min(220, Math.max(96, viewport.height * 0.3))
  const height = Math.min(rawHeight, maximumSpotlightHeight, availableHeight)

  const left = rawWidth >= availableWidth
    ? minimumLeft
    : clamp(targetRect.left - SPOTLIGHT_PADDING, minimumLeft, maximumLeft - width)

  let top
  if (rawHeight <= maximumSpotlightHeight) {
    top = clamp(targetRect.top - SPOTLIGHT_PADDING, minimumTop, maximumTop - height)
  } else if (targetRect.top >= minimumTop && targetRect.top <= maximumTop) {
    top = clamp(targetRect.top - SPOTLIGHT_PADDING, minimumTop, maximumTop - height)
  } else if (targetRect.bottom >= minimumTop && targetRect.bottom <= maximumTop) {
    top = clamp(targetRect.bottom + SPOTLIGHT_PADDING - height, minimumTop, maximumTop - height)
  } else {
    top = minimumTop
  }

  return roundedRect({
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
  })
}

function placementCandidates(spotlight, dialogWidth, dialogHeight, viewport) {
  const minimumLeft = viewport.left + TOUR_MARGIN
  const minimumTop = viewport.top + TOUR_MARGIN
  const maximumRight = viewport.left + viewport.width - TOUR_MARGIN
  const maximumBottom = viewport.top + viewport.height - TOUR_MARGIN
  const centerX = spotlight.left + (spotlight.width / 2)
  const centerY = spotlight.top + (spotlight.height / 2)

  return {
    bottom: {
      placement: 'bottom',
      left: centerX - (dialogWidth / 2),
      top: spotlight.bottom + TOUR_GAP,
      space: maximumBottom - spotlight.bottom - TOUR_GAP,
      required: dialogHeight,
    },
    top: {
      placement: 'top',
      left: centerX - (dialogWidth / 2),
      top: spotlight.top - TOUR_GAP - dialogHeight,
      space: spotlight.top - minimumTop - TOUR_GAP,
      required: dialogHeight,
    },
    right: {
      placement: 'right',
      left: spotlight.right + TOUR_GAP,
      top: centerY - (dialogHeight / 2),
      space: maximumRight - spotlight.right - TOUR_GAP,
      required: dialogWidth,
    },
    left: {
      placement: 'left',
      left: spotlight.left - TOUR_GAP - dialogWidth,
      top: centerY - (dialogHeight / 2),
      space: spotlight.left - minimumLeft - TOUR_GAP,
      required: dialogWidth,
    },
  }
}

export function calculateTourLayout({
  targetRect,
  dialogRect,
  viewport,
  preferredPlacement = 'bottom',
}) {
  const normalizedViewport = {
    left: Number.isFinite(viewport?.left) ? viewport.left : 0,
    top: Number.isFinite(viewport?.top) ? viewport.top : 0,
    width: Math.max(1, viewport?.width || 1),
    height: Math.max(1, viewport?.height || 1),
  }
  const maximumDialogWidth = Math.max(1, normalizedViewport.width - (TOUR_MARGIN * 2))
  const maximumDialogHeight = Math.max(1, normalizedViewport.height - (TOUR_MARGIN * 2))
  const rawDialogWidth = Math.max(dialogRect?.width || 380, 240)
  const rawDialogHeight = Math.max(dialogRect?.height || 220, 120)
  const dialogWidth = Math.min(rawDialogWidth, maximumDialogWidth)
  const dialogHeight = Math.min(rawDialogHeight, maximumDialogHeight)
  const minimumLeft = normalizedViewport.left + TOUR_MARGIN
  const minimumTop = normalizedViewport.top + TOUR_MARGIN
  const maximumLeft = normalizedViewport.left + normalizedViewport.width - TOUR_MARGIN - dialogWidth
  const maximumTop = normalizedViewport.top + normalizedViewport.height - TOUR_MARGIN - dialogHeight
  const spotlight = buildSpotlightRect(targetRect, normalizedViewport)

  function centeredLayout() {
    return {
      placement: 'center',
      spotlight: null,
      dialog: roundedRect({
        left: clamp(
          normalizedViewport.left + ((normalizedViewport.width - dialogWidth) / 2),
          minimumLeft,
          maximumLeft,
        ),
        top: clamp(
          normalizedViewport.top + ((normalizedViewport.height - dialogHeight) / 2),
          minimumTop,
          maximumTop,
        ),
        maxWidth: dialogWidth < rawDialogWidth ? dialogWidth : null,
        maxHeight: dialogHeight < rawDialogHeight ? dialogHeight : null,
      }),
      arrowOffset: null,
    }
  }

  if (!spotlight) return centeredLayout()

  const candidates = placementCandidates(
    spotlight,
    dialogWidth,
    dialogHeight,
    normalizedViewport,
  )
  const placementOrder = [preferredPlacement, 'bottom', 'top', 'right', 'left']
    .filter((placement, index, values) => candidates[placement] && values.indexOf(placement) === index)
  const fittingPlacement = placementOrder.find((placement) => (
    candidates[placement].space >= candidates[placement].required
  ))
  const selected = fittingPlacement
    ? candidates[fittingPlacement]
    : placementOrder
      .map((placement) => candidates[placement])
      .sort((first, second) => (
        (second.space / Math.max(1, second.required)) - (first.space / Math.max(1, first.required))
      ))[0]
  const isVerticalPlacement = selected.placement === 'top' || selected.placement === 'bottom'
  const minimumAnchoredSize = isVerticalPlacement
    ? MINIMUM_ANCHORED_DIALOG_HEIGHT
    : MINIMUM_ANCHORED_DIALOG_WIDTH
  if (!fittingPlacement && selected.space < minimumAnchoredSize) return centeredLayout()

  const constrainedDialogWidth = !fittingPlacement && !isVerticalPlacement
    ? Math.min(dialogWidth, Math.floor(selected.space))
    : dialogWidth
  const constrainedDialogHeight = !fittingPlacement && isVerticalPlacement
    ? Math.min(dialogHeight, Math.floor(selected.space))
    : dialogHeight
  const effectiveMaximumLeft = normalizedViewport.left + normalizedViewport.width - TOUR_MARGIN - constrainedDialogWidth
  const effectiveMaximumTop = normalizedViewport.top + normalizedViewport.height - TOUR_MARGIN - constrainedDialogHeight
  const selectedLeft = selected.placement === 'left'
    ? spotlight.left - TOUR_GAP - constrainedDialogWidth
    : selected.left
  const selectedTop = selected.placement === 'top'
    ? spotlight.top - TOUR_GAP - constrainedDialogHeight
    : selected.top
  const left = clamp(selectedLeft, minimumLeft, effectiveMaximumLeft)
  const top = clamp(selectedTop, minimumTop, effectiveMaximumTop)
  const targetCenterX = spotlight.left + (spotlight.width / 2)
  const targetCenterY = spotlight.top + (spotlight.height / 2)
  const arrowOffset = selected.placement === 'top' || selected.placement === 'bottom'
    ? clamp(targetCenterX - left, 24, dialogWidth - 24)
    : clamp(targetCenterY - top, 24, dialogHeight - 24)

  return {
    placement: selected.placement,
    spotlight,
    dialog: roundedRect({
      left,
      top,
      maxWidth: constrainedDialogWidth < rawDialogWidth ? constrainedDialogWidth : null,
      maxHeight: constrainedDialogHeight < rawDialogHeight ? constrainedDialogHeight : null,
    }),
    arrowOffset: Math.round(arrowOffset),
  }
}
