# Especificação visual alvo

## Direção

Visual institucional, técnico e operacional. Evitar aparência de landing page, excesso de glassmorphism, gradientes decorativos e cartões gigantes. A interface deve comunicar “sistema de gestão” e manter alta densidade sem parecer uma planilha crua.

## Tokens sugeridos

### Tema claro

| Token | Valor |
|---|---|
| Fundo app | `#F3F6FB` |
| Surface principal | `#FFFFFF` |
| Surface secundária | `#F8FAFD` |
| Sidebar | `#071426` |
| Texto forte | `#14233A` |
| Texto secundário | `#64748B` |
| Borda | `#D7E0ED` |
| Borda suave | `#E7ECF3` |
| Primária | `#2563EB` |
| Primária hover | `#1D4ED8` |
| Sucesso | `#16A36A` |
| Alerta | `#D99016` |
| Perigo | `#E5484D` |

### Tema escuro

| Token | Valor |
|---|---|
| Fundo app | `#07111F` |
| Surface principal | `#0D192B` |
| Surface secundária | `#101F34` |
| Sidebar | `#06101F` |
| Texto forte | `#F4F7FB` |
| Texto secundário | `#94A3B8` |
| Borda | `#21314B` |
| Borda suave | `#182840` |
| Primária | `#3B82F6` |
| Sucesso | `#35C58B` |
| Alerta | `#F3B84B` |
| Perigo | `#FF6B70` |

## Tipografia

Não adicionar nova dependência tipográfica. Reaproveitar fontes já utilizadas:

- **Manrope** para títulos/valores de KPI;
- **IBM Plex Sans** para interface, tabelas e formulários.

Escala desktop sugerida:

- título de página: 20–22 px / 700;
- título de seção: 15–17 px / 700;
- corpo: 13–14 px;
- tabela: 12–13 px;
- metadado: 11–12 px;
- KPI: 24–30 px / 700.

## Espaçamento

Base 4 px. Preferir 8, 12, 16, 20, 24 e 32. Tabelas e toolbars devem ser mais densas que cards de dashboard.

## Raios

- controles: 8 px;
- botões: 8 px;
- cards/tabelas: 10–12 px;
- modal: 14–16 px;
- chips: 999 px.

## Sidebar

- desktop normal: aproximadamente 220–236 px;
- compacta: 68–76 px;
- fundo escuro nos dois temas para manter identidade;
- item ativo com superfície azul e texto branco;
- ícones em caixas discretas somente quando necessário;
- não repetir descrições abaixo do item em desktop normal.

## Topbar

- altura visual de 46–52 px;
- título da rota à esquerda;
- busca global à direita/centro-direita;
- ações de sistema agrupadas;
- não competir com o conteúdo da página.

## Cabeçalho de página

Estrutura:

```text
Título + contexto curto                           ação primária | ações secundárias
Filtros / busca / status
Contadores compactos opcionais
```

## Tabelas

- surface branca/escura separada do fundo;
- cabeçalho de contraste discreto;
- sticky header em listas longas;
- linha hover sutil;
- primeira coluna deve agrupar identidade principal;
- status como chip;
- metadados em texto secundário;
- ações: no máximo 1–3 visíveis; demais em overflow;
- não esconder ação destrutiva sem confirmação, apenas movê-la para menu quando apropriado.

## Miniaturas de veículos

Exibir miniatura neutra de 42–56 px de largura junto da placa quando houver espaço. Mapear por `vehicle_type`. Não usar foto de marca/modelo específico; usar silhueta genérica.

Mapeamento base:

- HATCH → `hatch.svg`
- SEDAN → `sedan.svg`
- SUV / PERUA_SW → `suv.svg`
- PICAPE → `pickup.svg`
- VAN → `van.svg`
- MICRO_ONIBUS → `microbus.svg`
- ONIBUS → `bus.svg`
- CAMINHAO → `truck.svg`
- MOTOCICLETA → `motorcycle.svg`
- MAQUINA → `machine.svg`
- desconhecido → `default.svg`

## Ações

Hierarquia:

1. **Primária:** azul preenchido — uma por contexto.
2. **Secundária:** outline/neutra — consulta, exportação, edição.
3. **Perigosa:** vermelho apenas quando a ação for realmente destrutiva/irreversível.
4. **Overflow:** termos, histórico, rotas e outras ações de menor frequência.

## Referências visuais

Prioridade:

1. `references/target/02-telas-alvo-board.png`
2. `references/target/01-design-system-board.png`
3. `references/target/00-conceito-geral.png`

Os mockups são direção, não especificação de texto/valor. Os dados reais e rótulos funcionais do sistema prevalecem.
