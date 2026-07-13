"""Generate before/after PDF for Bloque D (IVA bugs D1, D2)."""
import os
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.colors import HexColor
from reportlab.lib.units import mm
from reportlab.lib.enums import TA_LEFT
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

FONT_DIR = '/usr/share/fonts'
pdfmetrics.registerFont(TTFont('NotoSerifSC', f'{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Regular.ttf'))
pdfmetrics.registerFont(TTFont('NotoSerifSC-Bold', f'{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Bold.ttf'))
pdfmetrics.registerFont(TTFont('DejaVuSans', f'{FONT_DIR}/truetype/dejavu/DejaVuSans.ttf'))
pdfmetrics.registerFont(TTFont('DejaVuSans-Bold', f'{FONT_DIR}/truetype/dejavu/DejaVuSans-Bold.ttf'))

ACCENT = HexColor('#059669')
RED = HexColor('#DC2626')
GRAY = HexColor('#6B7280')
LIGHT_BG = HexColor('#F0FDF4')
LIGHT_RED = HexColor('#FEF2F2')

output_path = '/home/z/my-project/download/Bloque_D_IVA_antes_despues.pdf'
os.makedirs(os.path.dirname(output_path), exist_ok=True)

doc = SimpleDocTemplate(output_path, pagesize=A4, leftMargin=20*mm, rightMargin=20*mm, topMargin=20*mm, bottomMargin=20*mm)

styles = getSampleStyleSheet()

title_style = ParagraphStyle('Title2', parent=styles['Title'], fontName='DejaVuSans-Bold', fontSize=16, textColor=HexColor('#111827'), spaceAfter=4*mm)
h2_style = ParagraphStyle('H2', parent=styles['Heading2'], fontName='DejaVuSans-Bold', fontSize=12, textColor=HexColor('#1E40AF'), spaceBefore=5*mm, spaceAfter=2*mm)
body_style = ParagraphStyle('Body2', parent=styles['Normal'], fontName='DejaVuSans', fontSize=9.5, leading=14, textColor=HexColor('#374151'), spaceAfter=2*mm)
mono_style = ParagraphStyle('Mono', parent=body_style, fontName='DejaVuSans', fontSize=8.5, leftIndent=5*mm, textColor=HexColor('#1F2937'), backColor=HexColor('#F9FAFB'), borderPadding=4)
label_style = ParagraphStyle('Label', parent=body_style, fontName='DejaVuSans-Bold', fontSize=9, textColor=GRAY, spaceBefore=1*mm)

def before_after_table(before_rows, after_rows, col_widths=None):
    """Build a before/after comparison table."""
    w = doc.width
    if col_widths is None:
        col_widths = [w * 0.14, w * 0.43, w * 0.43]
    header = [
        Paragraph('<b>Campo</b>', ParagraphStyle('th', parent=body_style, fontName='DejaVuSans-Bold', fontSize=8.5, textColor=HexColor('#FFFFFF'))),
        Paragraph('<b>ANTES (bug)</b>', ParagraphStyle('th', parent=body_style, fontName='DejaVuSans-Bold', fontSize=8.5, textColor=HexColor('#FFFFFF'))),
        Paragraph('<b>DESPUES (fix)</b>', ParagraphStyle('th', parent=body_style, fontName='DejaVuSans-Bold', fontSize=8.5, textColor=HexColor('#FFFFFF'))),
    ]
    data = [header]
    for row in before_rows:
        data.append([Paragraph(row[0], mono_style), Paragraph(row[1], mono_style), Paragraph('', mono_style)])
    for i, row in enumerate(after_rows):
        if i < len(before_rows):
            data[i + 1][2] = Paragraph(row[1], mono_style)
        else:
            data.append([Paragraph(row[0], mono_style), Paragraph('', mono_style), Paragraph(row[1], mono_style)])

    t = Table(data, colWidths=col_widths, repeatRows=1)
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), HexColor('#1E40AF')),
        ('TEXTCOLOR', (0, 0), (-1, 0), HexColor('#FFFFFF')),
        ('BACKGROUND', (1, 1), (1, -1), LIGHT_RED),
        ('BACKGROUND', (2, 1), (2, -1), LIGHT_BG),
        ('GRID', (0, 0), (-1, -1), 0.4, HexColor('#D1D5DB')),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 5),
        ('RIGHTPADDING', (0, 0), (-1, -1), 5),
    ]))
    return t

story = []

# Title
story.append(Paragraph('Bloque D — IVA: Informe Antes/Despues', title_style))
story.append(Paragraph('Bug D1 (carga IVA 0) y Bug D2 (selector manual + exencion)', ParagraphStyle('sub', parent=body_style, fontSize=10, textColor=GRAY)))
story.append(Spacer(1, 3*mm))

# ─── D1 ───
story.append(Paragraph('D1 — Bug de carga: IVA exento (0%) se convierte en 21%', h2_style))

story.append(Paragraph(
    'Al abrir un presupuesto guardado con <b>ivaPercent = 0</b> (exento), la linea '
    '<font face="DejaVuSans" size="8">budget.ivaPercent || 21</font> evaluaba <font face="DejaVuSans" size="8">0 || 21 = 21</font> '
    'porque 0 es falsy en JavaScript. El presupuesto exento reaparecia con 21% de IVA.',
    body_style
))

story.append(Paragraph('Ejemplo numerico', label_style))

t1 = before_after_table(
    before_rows=[
        ['DB guardado', 'ivaPercent = 0'],
        ['Carga en UI', '0 || 21 = 21 (falso 21%)'],
        ['Base imponible', '5.000,00 EUR'],
        ['IVA calculado', '5.000 x 21% = 1.050,00 EUR'],
        ['Total mostrado', '6.050,00 EUR (incorrecto)'],
    ],
    after_rows=[
        ['DB guardado', 'ivaPercent = 0'],
        ['Carga en UI', '0 ?? 21 = 0 (correcto)'],
        ['Base imponible', '5.000,00 EUR'],
        ['IVA calculado', '5.000 x 0% = 0,00 EUR'],
        ['Total mostrado', '5.000,00 EUR (correcto)'],
    ],
)
story.append(t1)
story.append(Spacer(1, 2*mm))

story.append(Paragraph('Fix: <font face="DejaVuSans" size="8">budget.ivaPercent ?? 21</font> en budget-form.tsx linea 254. '
    'El operador <b>??</b> (nullish coalescing) solo aplica el fallback cuando el valor es <b>null</b> o <b>undefined</b>, '
    'respetando un 0 legitimo. No se encontraron otros <font face="DejaVuSans" size="8">|| 21</font> que afecten a valores 0 legitimos '
    '(los <font face="DejaVuSans" size="8">|| 0</font> en discountPercent y parseFloat son correctos porque el valor deseado por defecto es 0).',
    body_style
))

# ─── D2 ───
story.append(Paragraph('D2 — Selector manual de IVA con opcion Exento', h2_style))

story.append(Paragraph(
    'Antes, el IVA era un campo numerico libre bloqueado a administradores (<font face="DejaVuSans" size="8">disabled={!isAdmin}</font>). '
    'Un comercial no podia seleccionar IVA exento. Ahora hay un <b>Select</b> con tres opciones: '
    '<b>21%</b> (estandar), <b>Exento (0%)</b> y <b>Personalizado</b>. Al elegir "Exento" se muestra '
    'una nota informativa sobre el Art. 20.Uno.3 LIVA. El selector esta disponible para cualquier rol.',
    body_style
))

story.append(Paragraph('Ejemplo numerico: presupuesto con descuento 10% + IVA exento', label_style))

t2 = before_after_table(
    before_rows=[
        ['Subtotal', '1.000,00 EUR'],
        ['Recargos', '200,00 EUR'],
        ['Base (sub + recargos)', '1.200,00 EUR'],
        ['Descuento 10%', '-120,00 EUR'],
        ['Base tras descuento', '1.080,00 EUR'],
        ['IVA (21%)', '226,80 EUR'],
        ['Total final', '1.306,80 EUR'],
    ],
    after_rows=[
        ['Subtotal', '1.000,00 EUR'],
        ['Recargos', '200,00 EUR'],
        ['Base (sub + recargos)', '1.200,00 EUR'],
        ['Descuento 10%', '-120,00 EUR'],
        ['Base tras descuento', '1.080,00 EUR'],
        ['IVA (0% exento)', '0,00 EUR'],
        ['Total final', '1.080,00 EUR'],
    ],
)
story.append(t2)
story.append(Spacer(1, 2*mm))

story.append(Paragraph('Persistencia: guardar con Exento y reabrir mantiene ivaPercent=0 gracias al fix D1 (<b>??</b> en vez de <b>||</b>).', body_style))

story.append(Paragraph('Motor de calculo: <font face="DejaVuSans" size="8">calculateBudgetTotals(blocks, 10, 0)</font> '
    'ya manejaba correctamente ivaPercent=0 (ivaAmount=0, totalFinal=base). El motor no necesito cambios; '
    'los 4 tests D2 validan: ivaPercent=0 sin descuento, con descuento, comparativa 21% vs 0%, y regresion D1.',
    body_style
))

# ─── Resumen tests ───
story.append(Paragraph('Resumen de tests', h2_style))

test_data = [
    [Paragraph('<b>Bloque</b>', ParagraphStyle('tc', parent=body_style, fontName='DejaVuSans-Bold', fontSize=8.5, textColor=HexColor('#FFFFFF'))),
     Paragraph('<b>Tests</b>', ParagraphStyle('tc', parent=body_style, fontName='DejaVuSans-Bold', fontSize=8.5, textColor=HexColor('#FFFFFF'))),
     Paragraph('<b>Estado</b>', ParagraphStyle('tc', parent=body_style, fontName='DejaVuSans-Bold', fontSize=8.5, textColor=HexColor('#FFFFFF')))],
    ['A1-A6', '20', 'PASSED'],
    ['B1-B3', '13', 'PASSED'],
    ['D2 (IVA)', '4', 'PASSED'],
    ['<b>Total</b>', '<b>37</b>', '<b>37/37 PASSED</b>'],
]

ts = Table(test_data, colWidths=[doc.width * 0.33, doc.width * 0.33, doc.width * 0.34])
ts.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, 0), HexColor('#1E40AF')),
    ('TEXTCOLOR', (0, 0), (-1, 0), HexColor('#FFFFFF')),
    ('BACKGROUND', (0, 3), (-1, 3), HexColor('#ECFDF5')),
    ('GRID', (0, 0), (-1, -1), 0.4, HexColor('#D1D5DB')),
    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ('TOPPADDING', (0, 0), (-1, -1), 4),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ('ALIGN', (1, 0), (-1, -1), 'CENTER'),
]))
story.append(ts)

story.append(Spacer(1, 4*mm))
story.append(Paragraph(
    'Ficheros modificados: <font face="DejaVuSans" size="8">src/components/views/budget-form.tsx</font> (D1 fix linea 254, D2 selector lineas 1997-2046), '
    '<font face="DejaVuSans" size="8">src/lib/calculation-engine.test.ts</font> (4 tests D2 anadidos). '
    'Motor de calculo (<font face="DejaVuSans" size="8">calculation-engine.ts</font>) y tipos (<font face="DejaVuSans" size="8">types.ts</font>) sin cambios.',
    ParagraphStyle('footer', parent=body_style, fontSize=8, textColor=GRAY)
))

doc.build(story)
print(f'OK: {output_path}')