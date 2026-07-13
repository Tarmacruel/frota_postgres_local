let destinationDraftSequence = 0

export function createDestinationDraft(values = {}) {
  destinationDraftSequence += 1
  return {
    _key: `destination-${destinationDraftSequence}`,
    description: '',
    address_reference: '',
    observation: '',
    ...values,
  }
}

export function serializeDestination(destination) {
  return {
    description: destination.description.trim(),
    address_reference: destination.address_reference.trim() || null,
    observation: destination.observation.trim() || null,
  }
}
