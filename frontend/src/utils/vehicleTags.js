export const tagSummary = (tags = []) => tags.map((tag) => `${tag.name} (${tag.owner_name})`).join('\n')

export const VEHICLE_TAG_COLORS = [
  ['blue', 'Azul'], ['amber', 'Amarelo'], ['red', 'Vermelho'],
  ['green', 'Verde'], ['purple', 'Roxo'], ['neutral', 'Cinza'],
  ['orange', 'Laranja'], ['teal', 'Turquesa'], ['pink', 'Rosa'],
  ['cyan', 'Ciano'], ['indigo', 'Índigo'], ['brown', 'Marrom'],
]
