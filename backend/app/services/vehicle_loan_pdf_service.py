from datetime import datetime
from functools import partial
from html import escape
from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfgen.canvas import Canvas
from reportlab.platypus import Image, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.core.official_identity import MUNICIPALITY_NAME, MUNICIPALITY_CNPJ, crest_path, ensure_pdf_fonts, institutional_datetime


def display_date(value):
    return institutional_datetime(datetime.fromisoformat(str(value).replace('Z', '+00:00'))).strftime('%d/%m/%Y às %H:%M') if value else 'Não informado'


class VehicleLoanPdfService:
    @staticmethod
    def build(snapshot, *, content_hash, signatures=None, document_id=None):
        """Canonical bytes omit live signatures; evidence exports append a dated signature section."""
        regular, bold = ensure_pdf_fonts()
        style = ParagraphStyle('loan-body', fontName=regular, fontSize=10, leading=14, spaceAfter=8,
                               textColor=colors.HexColor('#20304A'), splitLongWords=True)
        heading = ParagraphStyle('loan-heading', parent=style, fontName=bold, fontSize=15, leading=19, spaceAfter=15, keepWithNext=True)
        small = ParagraphStyle('loan-small', parent=style, fontSize=8, leading=11)
        def p(value, selected=style):
            return Paragraph(escape(str(value if value is not None else 'Não informado')).replace('\n', '<br/>'), selected)
        loan = snapshot['loan']
        returning = snapshot['document_type'] == 'VEHICLE_LOAN_RETURN_TERM'
        story = []
        if snapshot.get('test_environment'):
            story.append(p('AMBIENTE DE TESTES - SEM VALIDADE PARA OPERAÇÃO OFICIAL', small))
        header = Table([[Image(str(crest_path()), width=17*mm, height=21*mm),
                         p(MUNICIPALITY_NAME + '\nCNPJ ' + MUNICIPALITY_CNPJ, small)]], colWidths=[23*mm, 151*mm])
        header.setStyle(TableStyle([('VALIGN', (0,0), (-1,-1), 'MIDDLE'), ('LEFTPADDING', (0,0), (-1,-1), 0)]))
        story.extend([header, Spacer(1, 8*mm), p(snapshot['title'], heading)])
        fields = [('Identificação do empréstimo', loan['id']), ('Veículo', loan['vehicle_plate']),
                  ('Secretaria de origem', loan['origin_organization_name']),
                  ('Secretaria recebedora', loan['recipient_organization_name']),
                  ('Lotação de origem', loan['origin_allocation_name']),
                  ('Lotação de destino', loan['destination_allocation_name']),
                  ('Entrega efetiva', display_date(loan['started_at'])),
                  ('Previsão de devolução', display_date(loan['expected_return_at']) if loan['expected_return_at'] else 'Prazo indeterminado'),
                  ('Odômetro de entrega', str(loan['delivery_odometer_km']) + ' km')]
        if returning:
            fields.extend([('Devolução efetiva', display_date(loan['returned_at'])), ('Lotação de retorno', loan['return_allocation_name']),
                           ('Odômetro de devolução', str(loan['return_odometer_km']) + ' km')])
        for label, value in fields:
            story.append(p(label + ': ' + str(value or 'Não informado')))
        if loan.get('regularized_at'):
            story.append(p('Empréstimo incluído por regularização administrativa em ' + display_date(loan['regularized_at']), small))
            story.append(p('Referência da regularização: ' + loan.get('regularization_reference', ''), small))
        story.extend([Spacer(1, 3*mm), p('Motivo', heading), p(loan['reason']),
                      p('Condições de entrega', heading), p(loan['delivery_condition'])])
        if returning:
            story.extend([p('Condições de devolução', heading), p(loan['return_condition'])])
        story.extend([p('Declaração', heading), p(snapshot['declaration']), p('Representantes da operação', heading)])
        for item in snapshot['representatives']:
            story.append(p(f"{item['role']}: {item['name']} - {item['organization_name']}"))
        story.append(p('O aceite operacional e a assinatura eletrônica são registros distintos. Este conteúdo exige as assinaturas dos dois representantes identificados.', small))
        if signatures is not None:
            story.append(p('Evidências de assinatura eletrônica interna', heading))
            signed_ids = {str(item.signer_user_id) for item in signatures}
            for item in snapshot['representatives']:
                if item['user_id'] not in signed_ids:
                    story.append(p(item['name'] + ': assinatura pendente.'))
            for item in signatures:
                story.append(p(f'{item.signer_name} - {item.signer_organization_name}\nAssinou por senha em {display_date(item.signed_at)}.'))
                story.append(p('Identificador da evidência: ' + item.signature_fingerprint, small))
            story.append(p('Assinatura interna do sistema; este arquivo não contém assinatura criptográfica ICP-Brasil/PAdES.', small))
        else:
            story.append(p('PDF original do conteúdo preservado. Consulte as assinaturas atuais no sistema autenticado.', small))
        if document_id:
            story.append(p('Documento: ' + str(document_id), small))
        story.append(p('SHA-256 do conteúdo: ' + content_hash, small))
        output = BytesIO()
        def footer(canvas, doc):
            canvas.saveState()
            canvas.setFont(regular, 8)
            if doc.page > 1:
                label = ('TESTES | ' if snapshot.get('test_environment') else '') + snapshot['title']
                canvas.drawString(18*mm, A4[1]-10*mm, label)
            canvas.drawString(18*mm, 13*mm, 'Frota PMTF | Termos entre secretarias | Modelo v1')
            canvas.drawRightString(A4[0]-18*mm, 13*mm, f'Página {doc.page}')
            canvas.restoreState()
        doc = SimpleDocTemplate(output, pagesize=A4, leftMargin=18*mm, rightMargin=18*mm,
            topMargin=16*mm, bottomMargin=23*mm, title=snapshot['title'], author=MUNICIPALITY_NAME, invariant=1)
        doc.build(story, onFirstPage=footer, onLaterPages=footer, canvasmaker=partial(Canvas, invariant=1))
        return output.getvalue()
