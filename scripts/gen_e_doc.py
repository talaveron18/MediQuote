"""Generate before/after PDF for Bloque E (bugs E1-E6, E7 documented)."""
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
pdfmetrics.registerFont(TTFont('DejaVuSans', f'{FONT_DIR}/truetype/dejavu/DejaVuSans.ttf'))
pdfmetrics.registerFont(TTFont('DejaVuSans-Bold', f'{FONT_DIR}/truetype/dejavu/DejaVuSans-Bold.ttf'))

ACCENT = HexColor('#059669')
RED = HexColor('#DC2626')
GRAY = HexColor('#6B7280')
LIGHT_BG = HexColor('#F0FDF4')
LIGHT_RED = HexColor('#FEF2F2')

output_path = '/home/z/my-project/download/Bloque_E_antes_despues.pdf'
os.makedirs(os.path.dirname(output_path), exist_ok=True)

doc = SimpleDocTemplate(output_path, pagesize=A4, leftMargin=20*mm, rightMargin=20*mm, topMargin=20*mm, bottomMargin=20*mm)
styles = getSampleStyleSheet()

title_style = ParagraphStyle('T2', parent=styles['Title'], fontName='DejaVuSans-Bold', fontSize=15, textColor=HexColor('#111827'), spaceAfter=3*mm)
h2_style = ParagraphStyle('H2', parent=styles['Heading2'], fontName='DejaVuSans-Bold', fontSize=11, textColor=HexColor('#1E40AF'), spaceBefore=4*mm, spaceAfter=1.5*mm)
body = ParagraphStyle('B2', parent=styles['Normal'], fontName='DejaVuSans', fontSize=9, leading=13, textColor=HexColor('#374151'), spaceAfter=1.5*mm)
mono = ParagraphStyle('M', parent=body, fontSize=8, leftIndent=4*mm, textColor=HexColor('#1F2937'), backColor=HexColor('#F9FAFB'), borderPadding=3)

def ba_table(rows, widths=None):
    w = doc.width
    if widths is None:
        widths = [w * 0.13, w * 0.435, w * 0.435]
    hdr = [
        Paragraph('<b>Campo</b>', ParagraphStyle('th', parent=body, fontName='DejaVuSans-Bold', fontSize=8, textColor=HexColor('#FFFFFF'))),
        Paragraph('<b>ANTES</b>', ParagraphStyle('th', parent=body, fontName='DejaVuSans-Bold', fontSize=8, textColor=HexColor('#FFFFFF'))),
        Paragraph('<b>DESPUES</b>', ParagraphStyle('th', parent=body, fontName='DejaVuSans-Bold', fontSize=8, textColor=HexColor('#FFFFFF'))),
    ]
    data = [hdr]
    for r in rows:
        data.append([Paragraph(r[0], mono), Paragraph(r[1], mono), Paragraph(r[2], mono)])
    t = Table(data, colWidths=widths, repeatRows=1)
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), HexColor('#1E40AF')),
        ('BACKGROUND', (1, 1), (1, -1), LIGHT_RED),
        ('BACKGROUND', (2, 1), (2, -1), LIGHT_BG),
        ('GRID', (0, 0), (-1, -1), 0.4, HexColor('#D1D5DB')),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('TOPPADDING', (0, 0), (-1, -1), 3), ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('LEFTPADDING', (0, 0), (-1, -1), 4), ('RIGHTPADDING', (0, 0), (-1, -1), 4),
    ]))
    return t

story = []
story.append(Paragraph('Bloque E — Bugs Menores y Robustez: Antes/Despues', title_style))
story.append(Paragraph('E1-E6 implementados, E7 verificado (sin cambios necesarios)', ParagraphStyle('s', parent=body, fontSize=9.5, textColor=GRAY)))

# E1
story.append(Paragraph('E1 — Nocturnidad 24h: formula hardcodeada ignoraba pausa y configs invertidas', h2_style))
story.append(Paragraph(
    'El turno 24h usaba <font face="DejaVuSans" size="8">night = (24-nightStart)+nightEnd</font> '
    'si nightStart &lt;= 24, o 0 si no. Problemas: (a) no descontaba break de la noche, '
    '(b) devolvia 0 si nightEnd &gt; nightStart (config invertida), (c) incoherente con A4.',
    body))
story.append(ba_table([
    ['24h, ns=22, ne=6', 'night = (24-22)+6 = 8h (ok por casualidad)', 'compute24hNight(): 8h (dual-window, mismo resultado)'],
    ['24h, break=60m', 'night = 8h (NO descuenta break)', 'night = 8/24 * 23 = 7,67h (break uniforme)'],
    ['24h, ns=6, ne=22', 'night = 0 (nightEnd &gt; nightStart)', 'night = (22-6)/24*24 = 16h (single window)'],
]))
story.append(Spacer(1, 1*mm))

# E2
story.append(Paragraph('E2 — Redondeos intermedios causan descuadres de centimos con puestos', h2_style))
story.append(Paragraph(
    'posBreakdown se redondeaba antes de multiplicar por puestos. Surcharges usaban '
    '<font face="DejaVuSans" size="8">round(pos * puestos)</font> mientras subtotal usaba '
    '<font face="DejaVuSans" size="8">pos * puestos</font> directamente. Bases distintas.',
    body))
story.append(ba_table([
    ['Horas pos.', 'round(150.00) = 150,00', '150.00 (sin redondeo)'],
    ['Coverage h.', 'round(150*3) = 450,00', '150*3 = 450.00 (misma base)'],
    ['Subtotal', '450 * 10 = 4.500,00', '450 * 10 = 4.500,00 (idem)'],
    ['Nocturnidad', 'round(50*3)=150h * 25% = 375,00', '150h * 25% = 375,00 (sin redondeo)'],
]))
story.append(Spacer(1, 1*mm))

# E3
story.append(Paragraph('E3 — IVA sin tope superior', h2_style))
story.append(ba_table([
    ['iva=2100', 'IVA = 21.000 EUR (total 22.000)', 'clamp [0,100] -> IVA = 1.000 (total 2.000)'],
    ['iva=-50', 'max(-50, 0) = 0 (ok)', 'clamp [0,100] -> 0 (ok, doble guard)'],
]))
story.append(Spacer(1, 1*mm))

# E4
story.append(Paragraph('E4 — parseInt frágil para HH:MM', h2_style))
story.append(Paragraph(
    '<font face="DejaVuSans" size="8">parseInt("22:30") = 22</font> funciona por accidente. '
    'El nuevo <font face="DejaVuSans" size="8">parseHHMM("22:30")</font> = 22.5, '
    'que detecta correctamente si un turno empieza en franja nocturna.',
    body))
story.append(Spacer(1, 1*mm))

# E5
story.append(Paragraph('E5 — Enrutado bloque simple vs temporal simplificado', h2_style))
story.append(Paragraph(
    'Antes: logica enrevesada con <font face="DejaVuSans" size="8">isSimpleBlock = !includes(hora,dia,turno)</font> '
    'mas <font face="DejaVuSans" size="8">isDiaSimple</font> separado. Ahora: dos Sets explicitos '
    '(SIMPLE_BLOCK_TYPES y SIMPLE_UNIT_TYPES) con decision documentada en un comentario.',
    body))
story.append(Spacer(1, 1*mm))

# E6
story.append(Paragraph('E6 — Guardas de entrada', h2_style))
story.append(ba_table([
    ['hoursPerDay=0', 'subtotal negativo o NaN', 'subtotal = 0 (safeHPD = max(0, ...))'],
    ['pricePerHour=-10', 'subtotal = -160', 'subtotal = 0 (safePrice = max(0, ...))'],
    ['break=300, hpd=4', 'total = -1h', 'total = max(0, 4-5) = 0'],
    ['end &lt; start', 'bucle while vacio, 0 fechas', ' Early return con resultado 0 + aviso'],
]))
story.append(Spacer(1, 1*mm))

# E7
story.append(Paragraph('E7 — Coherencia PDF/Export (verificado, sin cambios)', h2_style))
story.append(Paragraph(
    'El PDF (<font face="DejaVuSans" size="8">api/pdf/route.ts</font>) consume '
    '<font face="DejaVuSans" size="8">budget.subtotal, budget.ivaAmount, budget.totalFinal</font> '
    'del objeto almacenado en DB. La exportacion ligera consume '
    '<font face="DejaVuSans" size="8">budget.totalFinal?.toFixed(2)</font>. '
    'Ninguno recalcula. Los totales del PDF/exportacion coinciden al centimo con los de /api/calculations.',
    body))

# Resumen
story.append(Spacer(1, 3*mm))
td = [
    [Paragraph('<b>Bloque</b>', ParagraphStyle('tc', parent=body, fontName='DejaVuSans-Bold', fontSize=8, textColor=HexColor('#FFFFFF'))),
     Paragraph('<b>Tests</b>', ParagraphStyle('tc', parent=body, fontName='DejaVuSans-Bold', fontSize=8, textColor=HexColor('#FFFFFF'))),
     Paragraph('<b>Estado</b>', ParagraphStyle('tc', parent=body, fontName='DejaVuSans-Bold', fontSize=8, textColor=HexColor('#FFFFFF')))],
    ['A1-A6', '20', 'PASSED'], ['B1-B3', '13', 'PASSED'], ['D2 (IVA)', '4', 'PASSED'],
    ['E1-E6', '20', 'PASSED'], ['<b>Total</b>', '<b>57</b>', '<b>57/57 PASSED</b>'],
]
ts = Table(td, colWidths=[doc.width * 0.33, doc.width * 0.33, doc.width * 0.34])
ts.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, 0), HexColor('#1E40AF')),
    ('BACKGROUND', (0, 4), (-1, 4), HexColor('#ECFDF5')),
    ('GRID', (0, 0), (-1, -1), 0.4, HexColor('#D1D5DB')),
    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ('TOPPADDING', (0, 0), (-1, -1), 3), ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
    ('ALIGN', (1, 0), (-1, -1), 'CENTER'),
]))
story.append(ts)
story.append(Spacer(1, 3*mm))
story.append(Paragraph(
    'Fichero modificado: <font face="DejaVuSans" size="8">src/lib/calculation-engine.ts</font> '
    '(E1 compute24hNight, E2 sin redondeo intermedio, E3 clamp IVA, E4 parseHHMM, '
    'E5 enrutado explicito, E6 guardas de entrada). '
    'Tests: <font face="DejaVuSans" size="8">calculation-engine.test.ts</font> (+20 tests, 57 total).',
    ParagraphStyle('f', parent=body, fontSize=7.5, textColor=GRAY)
))

doc.build(story)
print(f'OK: {output_path}')