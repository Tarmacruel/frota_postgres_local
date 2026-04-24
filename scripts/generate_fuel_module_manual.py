from __future__ import annotations

from datetime import datetime
from pathlib import Path

from PIL import Image as PILImage
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    Image,
    KeepTogether,
    ListFlowable,
    ListItem,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
ASSETS_DIR = ROOT / "output" / "doc" / "assets"
OUTPUT_DIR = ROOT / "output" / "doc"
OUTPUT_FILE = OUTPUT_DIR / "manual_modulo_abastecimento.pdf"
LOGO_PATH = ROOT / "frontend" / "public" / "brasao-pmtf.png"

PAGE_SIZE = landscape(A4)
PAGE_WIDTH, PAGE_HEIGHT = PAGE_SIZE

PRIMARY = colors.HexColor("#2452E8")
PRIMARY_DARK = colors.HexColor("#1739B7")
PRIMARY_DEEP = colors.HexColor("#0D2272")
INK = colors.HexColor("#20304A")
SOFT_INK = colors.HexColor("#66758C")
LINE = colors.HexColor("#D9E2F3")
LIGHT = colors.HexColor("#F5F8FF")
WARNING = colors.HexColor("#FFF4D9")


def build_styles():
    styles = getSampleStyleSheet()
    styles.add(
        ParagraphStyle(
            name="CoverKicker",
            parent=styles["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=11,
            leading=14,
            textColor=PRIMARY,
            alignment=TA_LEFT,
            spaceAfter=8,
        )
    )
    styles.add(
        ParagraphStyle(
            name="CoverTitle",
            parent=styles["Title"],
            fontName="Helvetica-Bold",
            fontSize=24,
            leading=28,
            textColor=INK,
            alignment=TA_LEFT,
            spaceAfter=10,
        )
    )
    styles.add(
        ParagraphStyle(
            name="Subtitle",
            parent=styles["BodyText"],
            fontName="Helvetica",
            fontSize=12,
            leading=17,
            textColor=SOFT_INK,
            alignment=TA_LEFT,
            spaceAfter=12,
        )
    )
    styles.add(
        ParagraphStyle(
            name="SectionTitle",
            parent=styles["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=16,
            leading=20,
            textColor=PRIMARY_DEEP,
            spaceBefore=0,
            spaceAfter=8,
        )
    )
    styles.add(
        ParagraphStyle(
            name="CardTitle",
            parent=styles["Heading3"],
            fontName="Helvetica-Bold",
            fontSize=12,
            leading=15,
            textColor=PRIMARY_DEEP,
            spaceAfter=4,
        )
    )
    styles.add(
        ParagraphStyle(
            name="Body",
            parent=styles["BodyText"],
            fontName="Helvetica",
            fontSize=10,
            leading=15,
            textColor=INK,
            spaceAfter=8,
        )
    )
    styles.add(
        ParagraphStyle(
            name="Small",
            parent=styles["BodyText"],
            fontName="Helvetica",
            fontSize=8.5,
            leading=12,
            textColor=SOFT_INK,
            spaceAfter=6,
        )
    )
    styles.add(
        ParagraphStyle(
            name="Caption",
            parent=styles["BodyText"],
            fontName="Helvetica-Oblique",
            fontSize=8.5,
            leading=11,
            textColor=SOFT_INK,
            alignment=TA_CENTER,
            spaceBefore=4,
            spaceAfter=8,
        )
    )
    styles.add(
        ParagraphStyle(
            name="Box",
            parent=styles["BodyText"],
            fontName="Helvetica",
            fontSize=9,
            leading=13,
            textColor=INK,
            spaceAfter=0,
        )
    )
    return styles


STYLES = build_styles()


def header_footer(canvas, doc):
    canvas.saveState()
    left = doc.leftMargin
    right = PAGE_WIDTH - doc.rightMargin
    top = PAGE_HEIGHT - 13 * mm
    bottom = 10 * mm

    canvas.setStrokeColor(LINE)
    canvas.setLineWidth(0.7)
    canvas.line(left, top, right, top)
    canvas.line(left, bottom + 4 * mm, right, bottom + 4 * mm)

    if LOGO_PATH.exists():
        canvas.drawImage(str(LOGO_PATH), left, PAGE_HEIGHT - 18 * mm, width=9 * mm, height=9 * mm, preserveAspectRatio=True, mask="auto")

    canvas.setFillColor(INK)
    canvas.setFont("Helvetica-Bold", 10)
    canvas.drawString(left + 12 * mm, PAGE_HEIGHT - 14 * mm, "Prefeitura Municipal de Teixeira de Freitas")
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(SOFT_INK)
    canvas.drawString(left + 12 * mm, PAGE_HEIGHT - 18 * mm, "Manual do módulo de abastecimento")
    canvas.drawRightString(right, PAGE_HEIGHT - 14 * mm, "Frota PMTF")

    canvas.setFont("Helvetica", 8)
    canvas.drawString(left, bottom, "Uso orientativo para homologação e treinamento.")
    canvas.drawRightString(right, bottom, f"Página {doc.page}")
    canvas.restoreState()


def scaled_image(path: Path, max_width: float, max_height: float) -> Image:
    with PILImage.open(path) as image:
        width, height = image.size
    scale = min(max_width / width, max_height / height)
    return Image(str(path), width=width * scale, height=height * scale)


def info_box(title: str, body: str):
    table = Table(
        [[Paragraph(f"<b>{title}</b>", STYLES["CardTitle"])], [Paragraph(body, STYLES["Box"])]],
        colWidths=[None],
    )
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), LIGHT),
                ("BOX", (0, 0), (-1, -1), 1, LINE),
                ("LEFTPADDING", (0, 0), (-1, -1), 12),
                ("RIGHTPADDING", (0, 0), (-1, -1), 12),
                ("TOPPADDING", (0, 0), (-1, -1), 10),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
            ]
        )
    )
    return table


def screenshot_block(title: str, description: str, image_name: str, caption: str):
    image_path = ASSETS_DIR / image_name
    content = [Paragraph(title, STYLES["SectionTitle"]), Paragraph(description, STYLES["Body"])]
    if image_path.exists():
        content.append(scaled_image(image_path, max_width=PAGE_WIDTH - 40 * mm, max_height=115 * mm))
        content.append(Paragraph(caption, STYLES["Caption"]))
    else:
        content.append(info_box("Captura não encontrada", f"A imagem esperada não foi localizada em {image_path}."))
    return [KeepTogether(content)]


def credentials_table():
    data = [
        [
            Paragraph("<b>Perfil</b>", STYLES["Small"]),
            Paragraph("<b>Uso principal</b>", STYLES["Small"]),
            Paragraph("<b>E-mail</b>", STYLES["Small"]),
            Paragraph("<b>Senha</b>", STYLES["Small"]),
        ],
        ["ADMIN", "Emissão de ordens, gestão, relatórios e auditoria do fluxo.", "admin@frota.local", "Admin@1234"],
        ["PRODUÇÃO", "Operação equivalente ao perfil administrativo do módulo.", "producao@frota.local", "Producao@1234"],
        ["POSTO", "Confirmação das ordens abertas do posto vinculado.", "posto@frota.local", "Posto@1234"],
        ["PADRÃO", "Perfil base para navegação geral sem foco operacional do módulo.", "padrao@frota.local", "User@1234"],
    ]
    table = Table(data, colWidths=[28 * mm, 78 * mm, 52 * mm, 34 * mm], repeatRows=1)
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), PRIMARY),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("LEADING", (0, 0), (-1, -1), 12),
                ("GRID", (0, 0), (-1, -1), 0.6, LINE),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT]),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 7),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        )
    )
    return table


def checklist_table():
    data = [
        [Paragraph("<b>Campo</b>", STYLES["Small"]), Paragraph("<b>Como preencher</b>", STYLES["Small"])],
        ["Odômetro real (km)", "Informar a quilometragem no momento do abastecimento."],
        ["Litros abastecidos", "Registrar a quantidade efetivamente fornecida no posto."],
        ["Valor total (R$)", "Campo opcional para o valor final da nota ou cupom."],
        ["Data/hora real", "Informar o instante real da operação, diferente do prazo de emissão."],
        ["Comprovante", "Anexar PDF, JPG, PNG ou WEBP com até 8 MB."],
        ["Observações", "Usar quando houver justificativas, divergências ou notas internas."],
    ]
    table = Table(data, colWidths=[48 * mm, 142 * mm], repeatRows=1)
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), PRIMARY_DARK),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("GRID", (0, 0), (-1, -1), 0.6, LINE),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT]),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 7),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
            ]
        )
    )
    return table


def build_story():
    generated_at = datetime.now().strftime("%d/%m/%Y às %H:%M")
    story = []

    if LOGO_PATH.exists():
        story.append(Image(str(LOGO_PATH), width=20 * mm, height=20 * mm))
        story.append(Spacer(1, 8))

    story.append(Paragraph("Frota PMTF · manual operacional", STYLES["CoverKicker"]))
    story.append(Paragraph("Módulo de abastecimento: passo a passo do início ao fim", STYLES["CoverTitle"]))
    story.append(
        Paragraph(
            "Documento de apoio para teste, homologação e treinamento dos perfis administrativos e do operador de posto. "
            "O conteúdo abaixo foi montado com capturas reais do sistema e resume o fluxo completo de emissão, validação, confirmação e consulta dos comprovantes.",
            STYLES["Subtitle"],
        )
    )
    story.append(
        info_box(
            "Escopo do manual",
            "1. Acesso ao sistema.<br/>"
            "2. Emissão da ordem de abastecimento.<br/>"
            "3. Geração do comprovante institucional em PDF.<br/>"
            "4. Validação pública por QR Code e link sem login.<br/>"
            "5. Confirmação da ordem pelo usuário do posto.<br/>"
            "6. Consulta posterior, histórico e relatórios.",
        )
    )
    story.append(Spacer(1, 10))
    story.append(
        info_box(
            "Ambiente utilizado neste documento",
            f"Endereço principal: <b>https://frota.sirel.com.br</b><br/>"
            f"Posto de teste vinculado: <b>Posto Centro</b><br/>"
            f"Exemplo de ordem aberta já disponível no seed: <b>AB-FBBBFD33</b><br/>"
            f"Data de geração do manual: <b>{generated_at}</b>",
        )
    )
    story.append(PageBreak())

    story.append(Paragraph("1. Perfis e credenciais de teste", STYLES["SectionTitle"]))
    story.append(
        Paragraph(
            "As credenciais abaixo existem no seed local do sistema e ajudam a testar o fluxo completo. "
            "Para o módulo de abastecimento, os perfis mais importantes são <b>ADMIN</b>, <b>PRODUÇÃO</b> e <b>POSTO</b>.",
            STYLES["Body"],
        )
    )
    story.append(credentials_table())
    story.append(Spacer(1, 10))
    story.append(
        info_box(
            "Atenção",
            "Estas contas são destinadas a ambiente de teste e demonstração. "
            "Em produção, as senhas devem ser redefinidas e tratadas como credenciais institucionais.",
        )
    )
    story.append(Spacer(1, 14))
    story.append(Paragraph("2. Fluxo resumido do módulo", STYLES["SectionTitle"]))
    summary_items = [
        "O perfil ADMIN ou PRODUÇÃO acessa a tela <b>Abastecimentos</b> e emite uma nova ordem para um posto credenciado.",
        "A ordem recebe comprovante institucional em PDF, código de validação e link público para consulta sem login.",
        "O operador do posto acessa a tela <b>Ordens abertas</b> e localiza apenas as ordens vinculadas ao seu posto.",
        "No fechamento, o posto informa odômetro, litros reais, valor final, data/hora real e anexa o comprovante fiscal.",
        "Após a confirmação, o abastecimento passa a compor o histórico administrativo com filtros, alertas e relatórios.",
    ]
    story.append(
        ListFlowable(
            [ListItem(Paragraph(item, STYLES["Body"])) for item in summary_items],
            bulletType="1",
            start="1",
            leftIndent=18,
        )
    )
    story.append(PageBreak())

    story.extend(
        screenshot_block(
            "3. Tela de login",
            "O acesso começa pela página institucional do sistema. "
            "Cada usuário entra com seu e-mail liberado e a senha correspondente ao perfil. "
            "Para testar o fluxo de abastecimento, recomenda-se iniciar com <b>admin@frota.local</b> para emissão e depois usar <b>posto@frota.local</b> para a confirmação.",
            "login-page.png",
            "Figura 1 — Tela inicial de autenticação do Frota PMTF.",
        )
    )
    story.append(PageBreak())

    story.extend(
        screenshot_block(
            "4. Gestão administrativa de abastecimentos",
            "Na página <b>/abastecimentos</b>, o perfil administrativo acompanha métricas rápidas, lista de ordens abertas, histórico de abastecimentos, filtros e ações de relatório. "
            "A própria tabela já oferece os atalhos para <b>Comprovante</b>, <b>Link público</b>, <b>Baixar PDF</b> e cancelamento quando a ordem ainda estiver aberta.",
            "admin-abastecimentos-page-1440.png",
            "Figura 2 — Painel administrativo do módulo de abastecimento com ordens, histórico e exportações.",
        )
    )
    story.append(Paragraph("Pontos de atenção nesta tela:", STYLES["CardTitle"]))
    admin_points = [
        "O botão <b>Nova ordem</b> inicia a emissão.",
        "As ações <b>Previsualizar PDF</b> e <b>Exportar XLSX</b> geram relatórios das ordens conforme os filtros aplicados.",
        "A seção <b>Histórico de abastecimentos</b> passa a mostrar os abastecimentos já confirmados pelo posto.",
    ]
    story.append(
        ListFlowable(
            [ListItem(Paragraph(item, STYLES["Body"])) for item in admin_points],
            bulletType="bullet",
            leftIndent=18,
        )
    )
    story.append(PageBreak())

    story.extend(
        screenshot_block(
            "5. Emissão da nova ordem",
            "Ao clicar em <b>Nova ordem</b>, o sistema abre a modal de emissão. "
            "O preenchimento mínimo envolve veículo, posto responsável e prazo limite. "
            "Também é possível informar condutor, órgão solicitante, litros previstos, observações e o <b>valor máximo com máscara em real</b>.",
            "admin-nova-ordem-modal-1440.png",
            "Figura 3 — Modal de emissão da ordem com máscara monetária em reais no valor máximo.",
        )
    )
    story.append(Paragraph("Campos principais da emissão:", STYLES["CardTitle"]))
    order_points = [
        "<b>Veículo</b>: unidade que será abastecida.",
        "<b>Posto</b>: posto credenciado que irá executar a operação.",
        "<b>Prazo limite</b>: data/hora de validade da autorização.",
        "<b>Litros previstos</b> e <b>Valor máximo</b>: limites autorizados para controle operacional.",
        "<b>Observações</b>: instruções para posto e equipe solicitante.",
    ]
    story.append(
        ListFlowable(
            [ListItem(Paragraph(item, STYLES["Body"])) for item in order_points],
            bulletType="bullet",
            leftIndent=18,
        )
    )
    story.append(PageBreak())

    story.extend(
        screenshot_block(
            "6. Validação pública do comprovante",
            "Depois da emissão, a ordem passa a ter um comprovante institucional em PDF com QR Code. "
            "Esse QR Code ou o botão <b>Link público</b> leva qualquer pessoa para uma página pública de validação, sem necessidade de login, onde o documento pode ser conferido e baixado novamente.",
            "public-validacao-comprovante.png",
            "Figura 4 — Página pública de validação da autenticidade do comprovante.",
        )
    )
    story.append(
        info_box(
            "Como funciona a autenticação do comprovante",
            "O PDF institucional incorpora um código de validação exclusivo e um QR Code. "
            "Ao ler o QR Code, o usuário é redirecionado para o endereço público da ordem e consegue confirmar os dados operacionais, o status e baixar novamente o PDF oficial.",
        )
    )
    story.append(PageBreak())

    story.extend(
        screenshot_block(
            "7. Visão do usuário do posto",
            "Ao entrar com <b>posto@frota.local</b>, a navegação é simplificada e mostra apenas o fluxo de atendimento do posto vinculado. "
            "A tela <b>/ordens-abastecimento</b> lista as ordens abertas para confirmação, com botão de comprovante e ação principal para concluir o abastecimento.",
            "posto-ordens-abertas-page.png",
            "Figura 5 — Painel do operador de posto com as ordens abertas disponíveis para confirmação.",
        )
    )
    story.append(Paragraph("Na confirmação do abastecimento, o posto informa:", STYLES["CardTitle"]))
    story.append(checklist_table())
    story.append(Spacer(1, 8))
    story.append(
        Paragraph(
            "O anexo do comprovante é obrigatório para concluir a ordem. "
            "Depois da confirmação, o registro deixa a fila de ordens abertas e passa a compor o histórico administrativo do módulo.",
            STYLES["Body"],
        )
    )
    story.append(PageBreak())

    story.append(Paragraph("8. Fechamento do fluxo e consultas posteriores", STYLES["SectionTitle"]))
    closing_items = [
        "Ordens emitidas podem ser consultadas, filtradas e exportadas em PDF ou XLSX pelo perfil administrativo.",
        "Comprovantes institucionais podem ser reabertos a qualquer momento pelo botão <b>Comprovante</b> ou pelo endereço público de validação.",
        "Abastecimentos confirmados passam para o histórico, onde ficam disponíveis para auditoria, abertura do comprovante anexado e análise de consumo.",
        "Se houver divergência, recomenda-se validar o código público do comprovante e conferir o anexo enviado pelo posto.",
    ]
    story.append(
        ListFlowable(
            [ListItem(Paragraph(item, STYLES["Body"])) for item in closing_items],
            bulletType="bullet",
            leftIndent=18,
        )
    )
    story.append(Spacer(1, 10))
    story.append(
        info_box(
            "Roteiro rápido de teste",
            "1. Entrar com <b>admin@frota.local</b>.<br/>"
            "2. Abrir <b>Abastecimentos</b> e emitir uma ordem.<br/>"
            "3. Abrir o comprovante, copiar o link público e validar a página sem login.<br/>"
            "4. Encerrar a sessão e entrar com <b>posto@frota.local</b>.<br/>"
            "5. Confirmar a ordem com os dados reais e anexar o comprovante.<br/>"
            "6. Voltar ao perfil administrativo e conferir o histórico do abastecimento.",
        )
    )
    story.append(Spacer(1, 12))
    story.append(
        Table(
            [[Paragraph("Prefeitura Municipal de Teixeira de Freitas · Frota PMTF · Documento de apoio operacional", STYLES["Small"])]],
            colWidths=[PAGE_WIDTH - 40 * mm],
        )
    )

    return story


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(
        str(OUTPUT_FILE),
        pagesize=PAGE_SIZE,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=22 * mm,
        bottomMargin=18 * mm,
        title="Manual do módulo de abastecimento",
        author="Codex",
    )
    story = build_story()
    doc.build(story, onFirstPage=header_footer, onLaterPages=header_footer)
    print(f"PDF gerado em: {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
