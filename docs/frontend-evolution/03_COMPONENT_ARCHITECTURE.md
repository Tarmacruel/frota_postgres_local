# Arquitetura de componentes proposta

## Estratégia

O projeto atualmente usa CSS global e componentes próprios. A evolução deve seguir a mesma arquitetura e **não introduzir Material UI, Ant Design, Tailwind ou outro framework** apenas para o redesign.

## Componentes base

### `PageHeader`

Responsável por título, descrição curta e área de ações. Não contém regras de negócio.

### `StatCard`

KPI compacto. Props sugeridas: `icon`, `label`, `value`, `note`, `tone`.

### `StatusChip`

Padroniza status sem acoplar a um módulo. O valor textual continua vindo da página.

### `VehicleThumbnail`

Mapeia `vehicle_type` para SVG genérico. `alt` deve ser funcional: “Miniatura ilustrativa do tipo Sedan”.

### `IconButton`

Botão pequeno com `aria-label` obrigatório.

### `ActionMenu`

Menu de overflow para ações secundárias. Deve:

- abrir por clique/teclado;
- fechar com Escape e clique externo;
- preservar foco;
- aceitar item destrutivo com classe/tom específico;
- não executar lógica de negócio internamente.

## Componentes existentes a preservar/reutilizar

- `AppIcon`
- `Modal`
- `Pagination`
- `SearchableSelect`
- `ProtectedRoute`
- `GuidedTour`
- componentes de assinatura digital
- componentes específicos de posse/rotas/abastecimento

## Antipadrões

- duplicar um `ActionMenu` diferente em cada página;
- codificar cores diretamente em JSX;
- criar um novo “theme context” paralelo ao `data-theme` existente;
- importar biblioteca de ícones apenas para uma tela;
- mover regra de negócio para componente visual;
- substituir componentes de assinatura por versões “mais bonitas”.
