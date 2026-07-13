"""
Auditoría dura del motor de cálculo MediQuote Pro v2
Ejecuta los 12 casos de prueba obligatorios y reporta PASS/FAIL
"""

import sys
import json
import os
import math

# Add src to path for direct import
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

# ─── We need to test the TypeScript engine directly via API ───
# Since we can't import TS directly, we test via HTTP calls to the running server
# OR we transpile the logic to Python for verification.

# Let's re-implement the critical formulas in Python to cross-check,
# and also test via the API if the server is running.

import urllib.request
import urllib.error

BASE = "http://localhost:3099"

def api_post(path, data, cookie=None):
    """POST to API and return parsed JSON"""
    headers = {"Content-Type": "application/json"}
    if cookie:
        headers["Cookie"] = cookie
    body = json.dumps(data).encode()
    req = urllib.request.Request(f"{BASE}{path}", data=body, headers=headers, method="POST")
    try:
        resp = urllib.request.urlopen(req, timeout=10)
        return json.loads(resp.read()), resp.status
    except urllib.error.HTTPError as e:
        return json.loads(e.read()), e.code
    except Exception as e:
        return {"error": str(e)}, 0

def api_get(path, cookie=None):
    headers = {}
    if cookie:
        headers["Cookie"] = cookie
    req = urllib.request.Request(f"{BASE}{path}", headers=headers)
    try:
        resp = urllib.request.urlopen(req, timeout=10)
        return json.loads(resp.read()), resp.status
    except urllib.error.HTTPError as e:
        return json.loads(e.read()), e.code
    except Exception as e:
        return {"error": str(e)}, 0


# ═══════════════════════════════════════════════════════════════════
# PYTHON RE-IMPLEMENTATION for cross-checking
# ═══════════════════════════════════════════════════════════════════

import datetime

def parse_date(s):
    y, m, d = s.split('-')
    return datetime.date(int(y), int(m), int(d))

def is_sunday(d):
    return d.weekday() == 6  # Python: Monday=0, Sunday=6

def is_weekend(d):
    return d.weekday() >= 5

def get_iso_week_year(d):
    """Returns (year, week) for ISO week"""
    # Python's isocalendar does this correctly
    iso = d.isocalendar()
    return iso[0], iso[1]

def calc_working_dates_range(start_str, end_str, days_of_week=None, exclude_sundays=True, exclude_holidays=True, holidays=None):
    """Python version of calculateWorkingDates"""
    if holidays is None:
        holidays = []
    holiday_set = set(h["date"] for h in holidays)
    
    start = parse_date(start_str)
    end = parse_date(end_str)
    
    if days_of_week is None or len(days_of_week) == 0:
        # Python weekday: Mon=0, Sun=6. The app uses JS: Sun=0, Mon=1...Sat=6
        # Map: JS 1-5 = Python 0-4 (Mon-Fri), JS 6 = Python 5 (Sat)
        days_of_week_py = [0, 1, 2, 3, 4, 5, 6]  # all days
    else:
        # Convert JS days (0=Sun, 1=Mon...6=Sat) to Python (0=Mon...6=Sun)
        days_of_week_py = []
        for js_day in days_of_week:
            py_day = (js_day - 1) % 7  # JS 1(Mon)->Py 0, JS 0(Sun)->Py 6
            days_of_week_py.append(py_day)
        days_of_week_py = list(set(days_of_week_py))
    
    dates = []
    current = start
    while current <= end:
        # Day of week filter
        if current.weekday() not in days_of_week_py:
            current += datetime.timedelta(days=1)
            continue
        # Sunday exclusion
        if exclude_sundays and is_sunday(current):
            current += datetime.timedelta(days=1)
            continue
        # Holiday exclusion
        if exclude_holidays and str(current) in holiday_set:
            current += datetime.timedelta(days=1)
            continue
        dates.append(str(current))
        current += datetime.timedelta(days=1)
    return dates


def calc_night_hours_custom(start_h, start_m, end_h, end_m, night_start=22, night_end=6, break_min=0):
    """Calculate night hours for a custom shift"""
    start_dec = start_h + start_m / 60
    end_dec = end_h + end_m / 60
    break_h = break_min / 60
    
    crosses_midnight = end_dec <= start_dec
    
    if crosses_midnight:
        total = (24 - start_dec) + end_dec - break_h
    else:
        total = end_dec - start_dec - break_h
    
    total = max(0, total)
    
    # Night calc
    night_h = 0
    if night_end <= night_start:  # e.g., 6 <= 22
        if crosses_midnight:
            # Night before midnight: from max(start, nightStart) to 24
            if start_dec >= night_start:
                night_before = 24 - start_dec
            else:
                night_before = 24 - night_start
            # Night after midnight: from 0 to min(end, nightEnd)
            night_after = min(end_dec, night_end)
            night_h = night_before + night_after
        else:
            # Doesn't cross midnight
            if start_dec >= night_start:
                night_h = end_dec - start_dec
            elif end_dec <= night_end:
                night_h = end_dec - start_dec
            elif start_dec < night_start and end_dec > night_start:
                night_h = end_dec - night_start
            elif start_dec < night_end and end_dec > night_end:
                night_h = night_end - start_dec
    
    night_h = min(night_h, total)
    return total, night_h


def calc_budget_totals(subtotal, total_surcharges, discount_pct, iva_pct):
    """Python version of calculateBudgetTotals"""
    base_for_discount = subtotal + total_surcharges
    discount_amount = base_for_discount * (discount_pct / 100)
    after_discount = base_for_discount - discount_amount
    iva_amount = after_discount * (iva_pct / 100)
    total_final = after_discount + iva_amount
    return {
        "subtotal": round(subtotal, 2),
        "totalSurcharges": round(total_surcharges, 2),
        "discountAmount": round(discount_amount, 2),
        "ivaAmount": round(iva_amount, 2),
        "totalFinal": round(total_final, 2),
    }


# ═══════════════════════════════════════════════════════════════════
# TEST RESULTS
# ═══════════════════════════════════════════════════════════════════

results = []

def report(case, status, expected, actual, notes=""):
    results.append({
        "case": case,
        "status": status,
        "expected": expected,
        "actual": actual,
        "notes": notes,
    })
    icon = "✅" if status == "PASS" else "❌"
    print(f"  {icon} {case}: {status}")
    if status == "FAIL":
        print(f"     Expected: {expected}")
        print(f"     Actual:   {actual}")
        if notes:
            print(f"     Notes:    {notes}")


# ═══════════════════════════════════════════════════════════════════
# CASE 1 — Médico 3 months, 1 puesto
# ═══════════════════════════════════════════════════════════════════
print("\n═══ CASO 1: Médico 3 meses, 1 puesto, Lun-Vie, excluir domingos ═══")

# 2026-07-01 (Wed) to 2026-09-30 (Wed) = 92 days natural
dates_c1 = calc_working_dates_range(
    "2026-07-01", "2026-09-30",
    days_of_week=[1, 2, 3, 4, 5],  # JS: Mon-Fri
    exclude_sundays=True,
    exclude_holidays=False,
)
expected_days_c1 = len(dates_c1)
expected_hours_c1 = expected_days_c1 * 8
expected_subtotal_c1 = expected_hours_c1 * 35  # 35€/h, 1 puesto

print(f"  Python check: {expected_days_c1} days, {expected_hours_c1}h, subtotal {expected_subtotal_c1}€")

# Test via API
block_c1 = {
    "serviceName": "Servicio médico",
    "professionalCategory": "Médico",
    "puestosSimultaneos": 1,
    "pricePerHour": 35,
    "dateMode": "range",
    "dateRangeStart": "2026-07-01",
    "dateRangeEnd": "2026-09-30",
    "daysOfWeek": [1, 2, 3, 4, 5],
    "excludeSundays": True,
    "excludeHolidays": False,
    "shiftType": "morning",
    "hoursPerDay": 8,
    "breakMinutes": 0,
    "unitType": "hora",
    "quantity": 1,
    "enabledSurcharges": [],
}

# Try API
calc_data, calc_status = api_post("/api/calculations", {"blocks": [block_c1]}, "gasi_session=fernando.suarez@gasisalud.com")
if calc_status == 200 and "blocks" in calc_data:
    b = calc_data["blocks"][0]
    report("C1-dias", "PASS" if b["totalWorkingDays"] == expected_days_c1 else "FAIL",
           expected_days_c1, b["totalWorkingDays"])
    report("C1-horas", "PASS" if b["coverageHours"] == expected_hours_c1 else "FAIL",
           expected_hours_c1, b["coverageHours"])
    report("C1-subtotal", "PASS" if b["subtotal"] == expected_subtotal_c1 else "FAIL",
           expected_subtotal_c1, b["subtotal"])
    report("C1-puestos", "PASS" if b["puestosSimultaneos"] == 1 else "FAIL",
           1, b["puestosSimultaneos"])
    report("C1-plantilla-no-multiplica",
           "PASS" if b["subtotal"] == expected_hours_c1 * 35 else "FAIL",
           expected_hours_c1 * 35, b["subtotal"],
           "Verificar que plantilla mínima NO multiplica el subtotal")
else:
    report("C1-API", "FAIL" if calc_status != 200 else "PASS", 200, calc_status, str(calc_data)[:200])


# ═══════════════════════════════════════════════════════════════════
# CASE 2 — Médico 3 months, 2 puestos
# ═══════════════════════════════════════════════════════════════════
print("\n═══ CASO 2: Médico 3 meses, 2 puestos ═══")

block_c2 = dict(block_c1, puestosSimultaneos=2)
expected_subtotal_c2 = expected_hours_c1 * 35 * 2

calc_data2, calc_status2 = api_post("/api/calculations", {"blocks": [block_c2]}, "gasi_session=fernando.suarez@gasisalud.com")
if calc_status2 == 200 and "blocks" in calc_data2:
    b2 = calc_data2["blocks"][0]
    report("C2-coverage-doble", "PASS" if b2["coverageHours"] == expected_hours_c1 * 2 else "FAIL",
           expected_hours_c1 * 2, b2["coverageHours"])
    report("C2-subtotal-doble", "PASS" if b2["subtotal"] == expected_subtotal_c2 else "FAIL",
           expected_subtotal_c2, b2["subtotal"])
else:
    report("C2-API", "FAIL", 200, calc_status2, str(calc_data2)[:200])


# ═══════════════════════════════════════════════════════════════════
# CASE 3 — Semana exacta 40h
# ═══════════════════════════════════════════════════════════════════
print("\n═══ CASO 3: Semana exacta 40h (Lun-Vie, 8h/día, 1 puesto) ═══")

block_c3 = {
    "serviceName": "Semana 40h",
    "professionalCategory": "Médico",
    "puestosSimultaneos": 1,
    "pricePerHour": 35,
    "dateMode": "range",
    "dateRangeStart": "2026-07-06",  # Monday
    "dateRangeEnd": "2026-07-10",    # Friday
    "daysOfWeek": [1, 2, 3, 4, 5],
    "excludeSundays": True,
    "excludeHolidays": False,
    "shiftType": "morning",
    "hoursPerDay": 8,
    "breakMinutes": 0,
    "unitType": "hora",
    "quantity": 1,
    "enabledSurcharges": [],
}

calc_data3, calc_status3 = api_post("/api/calculations", {"blocks": [block_c3]}, "gasi_session=fernando.suarez@gasisalud.com")
if calc_status3 == 200 and "blocks" in calc_data3:
    b3 = calc_data3["blocks"][0]
    report("C3-dias", "PASS" if b3["totalWorkingDays"] == 5 else "FAIL", 5, b3["totalWorkingDays"])
    report("C3-horas", "PASS" if b3["coverageHours"] == 40 else "FAIL", 40, b3["coverageHours"])
    report("C3-subtotal", "PASS" if b3["subtotal"] == 1400 else "FAIL", 1400, b3["subtotal"])
    report("C3-plantilla", "PASS" if b3["plantillaMinimaRecomendada"] == 1 else "FAIL", 1, b3["plantillaMinimaRecomendada"])
    has_weekly_warning = any("max_weekly" in w.get("type", "") for w in b3.get("laborWarnings", []))
    report("C3-sin-aviso-semanal", "PASS" if not has_weekly_warning else "FAIL",
           False, has_weekly_warning, "No debe haber aviso de exceso semanal")
else:
    report("C3-API", "FAIL", 200, calc_status3, str(calc_data3)[:200])


# ═══════════════════════════════════════════════════════════════════
# CASE 4 — Semana 48h (Lun-Sab)
# ═══════════════════════════════════════════════════════════════════
print("\n═══ CASO 4: Semana 48h (Lun-Sab, 8h/día, 1 puesto) ═══")

block_c4 = {
    "serviceName": "Semana 48h",
    "professionalCategory": "Médico",
    "puestosSimultaneos": 1,
    "pricePerHour": 35,
    "dateMode": "range",
    "dateRangeStart": "2026-07-06",  # Monday
    "dateRangeEnd": "2026-07-11",    # Saturday
    "daysOfWeek": [1, 2, 3, 4, 5, 6],
    "excludeSundays": True,
    "excludeHolidays": False,
    "shiftType": "morning",
    "hoursPerDay": 8,
    "breakMinutes": 0,
    "unitType": "hora",
    "quantity": 1,
    "enabledSurcharges": [],
}

calc_data4, calc_status4 = api_post("/api/calculations", {"blocks": [block_c4]}, "gasi_session=fernando.suarez@gasisalud.com")
if calc_status4 == 200 and "blocks" in calc_data4:
    b4 = calc_data4["blocks"][0]
    report("C4-dias", "PASS" if b4["totalWorkingDays"] == 6 else "FAIL", 6, b4["totalWorkingDays"])
    report("C4-horas", "PASS" if b4["coverageHours"] == 48 else "FAIL", 48, b4["coverageHours"])
    # With 1 puesto and 48h/week, plantilla mínima = ceil(48/40) = 2
    report("C4-plantilla", "PASS" if b4["plantillaMinimaRecomendada"] == 2 else "FAIL",
           2, b4["plantillaMinimaRecomendada"])
    # Subtotal should still be hoursCobertura × precio = 48 × 35 = 1680 (NOT multiplied by plantilla)
    report("C4-subtotal-no-plantilla", "PASS" if b4["subtotal"] == 1680 else "FAIL",
           1680, b4["subtotal"], "Subtotal NO debe multiplicar por plantilla mínima")
    has_weekly_warning = any("max_weekly" in w.get("type", "") for w in b4.get("laborWarnings", []))
    report("C4-aviso-semanal", "PASS" if has_weekly_warning else "FAIL",
           True, has_weekly_warning, "Debe haber aviso de exceso semanal con 1 puesto")
else:
    report("C4-API", "FAIL", 200, calc_status4, str(calc_data4)[:200])


# ═══════════════════════════════════════════════════════════════════
# CASE 5 — Turno nocturno (Viernes y sábado, 20:00-08:00)
# ═══════════════════════════════════════════════════════════════════
print("\n═══ CASO 5: Turno nocturno Vie+Sáb 20:00-08:00 ═══")

# First check the night hour calculation in Python
total_py, night_py = calc_night_hours_custom(20, 0, 8, 0, night_start=22, night_end=6)
print(f"  Python night calc: 20:00-08:00 → total={total_py}h, night={night_py}h")
# Expected: crosses midnight. Total = (24-20)+8 = 12h. Night: (24-22)+6 = 8h.

report("C5-python-night", "PASS" if night_py == 8 else "FAIL", 8, night_py)
report("C5-python-total", "PASS" if total_py == 12 else "FAIL", 12, total_py)

block_c5 = {
    "serviceName": "Nocturno finde",
    "professionalCategory": "Enfermero",
    "puestosSimultaneos": 1,
    "pricePerHour": 22,
    "dateMode": "specific",
    "specificDates": ["2026-07-10", "2026-07-11"],  # Fri, Sat
    "daysOfWeek": [],
    "excludeSundays": True,
    "excludeHolidays": False,
    "shiftType": "custom",
    "shiftStartTime": "20:00",
    "shiftEndTime": "08:00",
    "hoursPerDay": 12,
    "breakMinutes": 0,
    "unitType": "hora",
    "quantity": 1,
    "enabledSurcharges": ["nocturnidad", "fin_de_semana"],
}

calc_data5, calc_status5 = api_post("/api/calculations", {"blocks": [block_c5]}, "gasi_session=fernando.suarez@gasisalud.com")
if calc_status5 == 200 and "blocks" in calc_data5:
    b5 = calc_data5["blocks"][0]
    report("C5-dias", "PASS" if b5["totalWorkingDays"] == 2 else "FAIL", 2, b5["totalWorkingDays"])
    report("C5-horas-total", "PASS" if b5["coverageHours"] == 24 else "FAIL", 24, b5["coverageHours"])
    report("C5-nocturnas", "PASS" if b5["shiftBreakdown"]["night"] == 16 else "FAIL",
           16, b5["shiftBreakdown"]["night"], "8h nocturnas × 2 días = 16h")
    # Subtotal base: 24h × 22€ = 528
    report("C5-subtotal", "PASS" if b5["subtotal"] == 528 else "FAIL", 528, b5["subtotal"])
    # Surcharges: nocturnidad 25% on night hours, fin_de_semana 30% on weekend hours
    # Night: 16h. Weekend: 24h (both days)
    # Nocturnidad: (22 * 16) * 0.25 = 88€
    # Fin de semana: (22 * 24) * 0.30 = 158.4€
    noct_amount = sum(s["amount"] for s in b5["surcharges"] if s["type"] == "nocturnidad")
    fds_amount = sum(s["amount"] for s in b5["surcharges"] if s["type"] == "fin_de_semana")
    report("C5-nocturnidad-amount", "PASS" if noct_amount == 88.0 else "FAIL",
           88.0, noct_amount, "Nocturnidad: 25% de (22€ × 16h)")
    report("C5-finde-amount", "PASS" if fds_amount == 158.4 else "FAIL",
           158.4, fds_amount, "Fin de semana: 30% de (22€ × 24h)")
else:
    report("C5-API", "FAIL", 200, calc_status5, str(calc_data5)[:300])


# ═══════════════════════════════════════════════════════════════════
# CASE 6 — Cruce de año (29 dic - 5 ene)
# ═══════════════════════════════════════════════════════════════════
print("\n═══ CASO 6: Cruce de año 29 dic - 5 ene ═══")

# Python verification
dates_c6 = calc_working_dates_range(
    "2025-12-29", "2026-01-05",
    days_of_week=[1, 2, 3, 4, 5],
    exclude_sundays=True,
    exclude_holidays=False,
)
print(f"  Python: {len(dates_c6)} dates: {dates_c6}")

# Check ISO weeks don't mix years
week_years = []
for d in dates_c6:
    dt = parse_date(d)
    wy, w = get_iso_week_year(dt)
    week_years.append((wy, w))
print(f"  ISO weeks: {week_years}")

# Dec 29 2025 is Monday of ISO week 1 of 2026
# Jan 1-2 are holidays (nacional), but we're not excluding holidays here
# So: Dec 29, 30, 31 (2025), Jan 2, 5 (2026) = 5 days (Jan 1 is Wed, might be holiday but we don't exclude)
# Wait, Jan 1 2026 is a Thursday. With days_of_week Mon-Fri, it should be included
# Dec 29 Mon, Dec 30 Tue, Dec 31 Wed, Jan 1 Thu, Jan 2 Fri, Jan 5 Mon = 6 days

block_c6 = {
    "serviceName": "Cruce año",
    "professionalCategory": "Médico",
    "puestosSimultaneos": 1,
    "pricePerHour": 35,
    "dateMode": "range",
    "dateRangeStart": "2025-12-29",
    "dateRangeEnd": "2026-01-05",
    "daysOfWeek": [1, 2, 3, 4, 5],
    "excludeSundays": True,
    "excludeHolidays": False,
    "shiftType": "morning",
    "hoursPerDay": 8,
    "breakMinutes": 0,
    "unitType": "hora",
    "quantity": 1,
    "enabledSurcharges": [],
}

calc_data6, calc_status6 = api_post("/api/calculations", {"blocks": [block_c6]}, "gasi_session=fernando.suarez@gasisalud.com")
if calc_status6 == 200 and "blocks" in calc_data6:
    b6 = calc_data6["blocks"][0]
    # Check weekly breakdown doesn't mix ISO years
    weekly = b6.get("weeklyHoursPerPro", [])
    # There should be at most 1 week of 2025 and 1-2 weeks of 2026
    years_in_weeks = set()
    for w in weekly:
        years_in_weeks.add(w.get("year"))
    report("C6-dias", "PASS" if b6["totalWorkingDays"] == len(dates_c6) else "FAIL",
           len(dates_c6), b6["totalWorkingDays"])
    report("C6-weeks-separated",
           "PASS" if len(weekly) <= 3 else "FAIL",
           "<=3 weeks", len(weekly),
           f"Weeks: {weekly}")
else:
    report("C6-API", "FAIL", 200, calc_status6, str(calc_data6)[:300])


# ═══════════════════════════════════════════════════════════════════
# CASE 7 — Fechas concretas (4 días sueltos)
# ═══════════════════════════════════════════════════════════════════
print("\n═══ CASO 7: Fechas concretas (4 días sueltos) ═══")

block_c7 = {
    "serviceName": "Fechas sueltas",
    "professionalCategory": "Médico",
    "puestosSimultaneos": 1,
    "pricePerHour": 35,
    "dateMode": "specific",
    "specificDates": ["2026-07-03", "2026-07-05", "2026-07-09", "2026-07-15"],
    "daysOfWeek": [],
    "excludeSundays": True,
    "excludeHolidays": False,
    "shiftType": "morning",
    "hoursPerDay": 8,
    "breakMinutes": 0,
    "unitType": "hora",
    "quantity": 1,
    "enabledSurcharges": [],
}

calc_data7, calc_status7 = api_post("/api/calculations", {"blocks": [block_c7]}, "gasi_session=fernando.suarez@gasisalud.com")
if calc_status7 == 200 and "blocks" in calc_data7:
    b7 = calc_data7["blocks"][0]
    report("C7-dias", "PASS" if b7["totalWorkingDays"] == 4 else "FAIL", 4, b7["totalWorkingDays"])
    report("C7-horas", "PASS" if b7["coverageHours"] == 32 else "FAIL", 32, b7["coverageHours"])
    report("C7-subtotal", "PASS" if b7["subtotal"] == 1120 else "FAIL", 1120, b7["subtotal"])
    report("C7-no-mes-entero", "PASS" if b7["totalWorkingDays"] == 4 else "FAIL",
           4, b7["totalWorkingDays"], "No debe calcular todo el mes")
else:
    report("C7-API", "FAIL", 200, calc_status7, str(calc_data7)[:300])


# ═══════════════════════════════════════════════════════════════════
# CASE 8 — Ambulancia (fijo diario)
# ═══════════════════════════════════════════════════════════════════
print("\n═══ CASO 8: Ambulancia (servicio, fijo diario) ═══")

block_c8 = {
    "serviceName": "Ambulancia",
    "professionalCategory": "Conductor",
    "puestosSimultaneos": 1,
    "pricePerHour": 0,
    "fixedPrice": 150,
    "dateMode": "range",
    "dateRangeStart": "2026-07-01",
    "dateRangeEnd": "2026-07-03",
    "daysOfWeek": [],
    "excludeSundays": False,
    "excludeHolidays": False,
    "shiftType": "morning",
    "hoursPerDay": 0,
    "breakMinutes": 0,
    "unitType": "servicio",
    "quantity": 3,
    "enabledSurcharges": [],
}

calc_data8, calc_status8 = api_post("/api/calculations", {"blocks": [block_c8]}, "gasi_session=fernando.suarez@gasisalud.com")
if calc_status8 == 200 and "blocks" in calc_data8:
    b8 = calc_data8["blocks"][0]
    report("C8-subtotal", "PASS" if b8["subtotal"] == 450 else "FAIL",
           450, b8["subtotal"], "150€ × 3 servicios = 450€")
    report("C8-sin-horas", "PASS" if b8["totalWorkingDays"] == 0 else "FAIL",
           0, b8["totalWorkingDays"], "No debe calcular días para servicios")
else:
    report("C8-API", "FAIL", 200, calc_status8, str(calc_data8)[:300])


# ═══════════════════════════════════════════════════════════════════
# CASE 9 — Material (cantidad × precio)
# ═══════════════════════════════════════════════════════════════════
print("\n═══ CASO 9: Material (10 unidades × 25€) ═══")

block_c9 = {
    "serviceName": "Material médico",
    "professionalCategory": "Material",
    "puestosSimultaneos": 1,
    "pricePerHour": 25,
    "dateMode": "range",
    "dateRangeStart": "2026-07-01",
    "dateRangeEnd": "2026-07-01",
    "daysOfWeek": [],
    "excludeSundays": False,
    "excludeHolidays": False,
    "shiftType": "morning",
    "hoursPerDay": 0,
    "breakMinutes": 0,
    "unitType": "unidad",
    "quantity": 10,
    "enabledSurcharges": [],
}

calc_data9, calc_status9 = api_post("/api/calculations", {"blocks": [block_c9]}, "gasi_session=fernando.suarez@gasisalud.com")
if calc_status9 == 200 and "blocks" in calc_data9:
    b9 = calc_data9["blocks"][0]
    report("C9-subtotal", "PASS" if b9["subtotal"] == 250 else "FAIL",
           250, b9["subtotal"], "10 × 25€ = 250€")
    report("C9-sin-horas", "PASS" if b9["totalWorkingDays"] == 0 else "FAIL",
           0, b9["totalWorkingDays"], "No debe calcular horas para materiales")
else:
    report("C9-API", "FAIL", 200, calc_status9, str(calc_data9)[:300])


# ═══════════════════════════════════════════════════════════════════
# CASE 10 — Recargos manuales (activados vs desactivados)
# ═══════════════════════════════════════════════════════════════════
print("\n═══ CASO 10: Recargos manuales (sin urgencia vs con urgencia) ═══")

block_c10a = {
    "serviceName": "Urgencia OFF",
    "professionalCategory": "Médico",
    "puestosSimultaneos": 1,
    "pricePerHour": 35,
    "dateMode": "specific",
    "specificDates": ["2026-07-06", "2026-07-07"],  # Mon-Tue
    "daysOfWeek": [],
    "excludeSundays": True,
    "excludeHolidays": False,
    "shiftType": "morning",
    "hoursPerDay": 8,
    "breakMinutes": 0,
    "unitType": "hora",
    "quantity": 1,
    "enabledSurcharges": [],  # No urgencia
}

calc_data10a, s10a = api_post("/api/calculations", {"blocks": [block_c10a]}, "gasi_session=fernando.suarez@gasisalud.com")
if s10a == 200 and "blocks" in calc_data10a:
    b10a = calc_data10a["blocks"][0]
    has_urgencia = any(s["type"] == "urgencia" for s in b10a.get("surcharges", []))
    report("C10-sin-urgencia", "PASS" if not has_urgencia else "FAIL",
           False, has_urgencia, "Urgencia NO debe aplicarse si no está en enabledSurcharges")
else:
    report("C10a-API", "FAIL", 200, s10a)

block_c10b = dict(block_c10a, enabledSurcharges=["urgencia"])
calc_data10b, s10b = api_post("/api/calculations", {"blocks": [block_c10b]}, "gasi_session=fernando.suarez@gasisalud.com")
if s10b == 200 and "blocks" in calc_data10b:
    b10b = calc_data10b["blocks"][0]
    has_urgencia_b = any(s["type"] == "urgencia" for s in b10b.get("surcharges", []))
    urg_amount = sum(s["amount"] for s in b10b.get("surcharges", []) if s["type"] == "urgencia")
    # Urgencia 40% on (35€ × 16h) = 224€
    report("C10-con-urgencia", "PASS" if has_urgencia_b else "FAIL",
           True, has_urgencia_b, "Urgencia debe aplicarse")
    report("C10-urgencia-amount", "PASS" if urg_amount == 224.0 else "FAIL",
           224.0, urg_amount, "40% de (35€ × 16h) = 224€")
else:
    report("C10b-API", "FAIL", 200, s10b)


# ═══════════════════════════════════════════════════════════════════
# CASE 11 — Descuento 10% + IVA 21%
# ═══════════════════════════════════════════════════════════════════
print("\n═══ CASO 11: Descuento 10% + IVA 21% (subtotal 1000€) ═══")

# Python verification
py_totals = calc_budget_totals(1000, 0, 10, 21)
print(f"  Python: {py_totals}")

report("C11-descuento", "PASS" if py_totals["discountAmount"] == 100.0 else "FAIL",
       100.0, py_totals["discountAmount"], "10% de 1000 = 100")
report("C11-base-iva", "PASS" if py_totals["ivaAmount"] == 189.0 else "FAIL",
       189.0, py_totals["ivaAmount"], "21% de 900 = 189")
report("C11-total", "PASS" if py_totals["totalFinal"] == 1089.0 else "FAIL",
       1089.0, py_totals["totalFinal"], "900 + 189 = 1089")

# Also verify via API
block_c11 = {
    "serviceName": "Test descuento",
    "professionalCategory": "Médico",
    "puestosSimultaneos": 1,
    "pricePerHour": 125,  # 125 * 8h = 1000
    "dateMode": "specific",
    "specificDates": ["2026-07-06"],
    "daysOfWeek": [],
    "excludeSundays": True,
    "excludeHolidays": False,
    "shiftType": "morning",
    "hoursPerDay": 8,
    "breakMinutes": 0,
    "unitType": "hora",
    "quantity": 1,
    "enabledSurcharges": [],
}

calc_data11, s11 = api_post("/api/calculations", {"blocks": [block_c11], "discountPercent": 10, "ivaPercent": 21}, "gasi_session=fernando.suarez@gasisalud.com")
if s11 == 200 and "totals" in calc_data11:
    t11 = calc_data11["totals"]
    report("C11-api-descuento", "PASS" if t11["discountAmount"] == 100.0 else "FAIL",
           100.0, t11["discountAmount"])
    report("C11-api-iva", "PASS" if t11["ivaAmount"] == 189.0 else "FAIL",
           189.0, t11["ivaAmount"])
    report("C11-api-total", "PASS" if t11["totalFinal"] == 1089.0 else "FAIL",
           1089.0, t11["totalFinal"])
else:
    report("C11-API", "FAIL", 200, s11, str(calc_data11)[:300])


# ═══════════════════════════════════════════════════════════════════
# CASE 12 — Comercial malicioso
# ═══════════════════════════════════════════════════════════════════
print("\n═══ CASO 12: Comercial malicioso (campos internos) ═══")

malicious_block = {
    "serviceName": "Ataque",
    "professionalCategory": "Médico",
    "puestosSimultaneos": 1,
    "pricePerHour": 35,
    "internalCostPerHour": 5,
    "internalMargin": 30,
    "dateMode": "specific",
    "specificDates": ["2026-07-06"],
    "daysOfWeek": [],
    "excludeSundays": True,
    "excludeHolidays": False,
    "shiftType": "morning",
    "hoursPerDay": 8,
    "breakMinutes": 0,
    "unitType": "hora",
    "quantity": 1,
    "enabledSurcharges": [],
}

# Comercial tries to calculate with internal fields
calc_data12, s12 = api_post("/api/calculations", {"blocks": [malicious_block]}, "gasi_session=comercial@gasisalud.com")
if s12 == 200:
    b12 = calc_data12.get("blocks", [{}])[0] if "blocks" in calc_data12 else {}
    has_internal_cost = "internalCostPerHour" in str(b12)
    has_margin = "internalMargin" in str(b12)
    report("C12-no-internal-cost", "PASS" if not has_internal_cost else "FAIL",
           False, has_internal_cost, "Respuesta no debe contener internalCostPerHour")
    report("C12-no-margin", "PASS" if not has_margin else "FAIL",
           False, has_margin, "Respuesta no debe contener internalMargin")
else:
    report("C12-API", "FAIL", 200, s12)

# Comercial tries to CREATE a budget with internal fields
budget_malicious = {
    "clientCif": "B12345678",
    "description": "Test comercial malicioso",
    "serviceBlocks": [malicious_block],
    "internalNotes": "Coste real: 5€/h, margen 30%",
}

budget_result12, br12 = api_post("/api/budgets", budget_malicious, "gasi_session=comercial@gasisalud.com")
if br12 in [200, 201]:
    has_internal_notes = "internalNotes" in str(budget_result12)
    report("C12-no-internal-notes-response", "PASS" if not has_internal_notes else "FAIL",
           False, has_internal_notes, "Respuesta de creación no debe incluir internalNotes")
else:
    report("C12-budget-create", "PASS" if br12 in [200, 201] else "FAIL",
           "200/201", br12, str(budget_result12)[:200])


# ═══════════════════════════════════════════════════════════════════
# BONUS: Night hour edge cases (pure Python)
# ═══════════════════════════════════════════════════════════════════
print("\n═══ BONUS: Edge cases nocturnidad (Python) ═══")

# 22:00-06:00 = 8h total, 8h night
t, n = calc_night_hours_custom(22, 0, 6, 0)
report("BONUS-22-06", "PASS" if t == 8 and n == 8 else "FAIL", (8, 8), (t, n))

# 23:00-03:00 = 4h total, 4h night
t, n = calc_night_hours_custom(23, 0, 3, 0)
report("BONUS-23-03", "PASS" if t == 4 and n == 4 else "FAIL", (4, 4), (t, n))

# 06:00-14:00 = 8h total, 0h night
t, n = calc_night_hours_custom(6, 0, 14, 0)
report("BONUS-06-14", "PASS" if t == 8 and n == 0 else "FAIL", (8, 0), (t, n))

# 21:00-22:00 = 1h total, 1h night (starts before 22, ends at 22)
t, n = calc_night_hours_custom(21, 0, 22, 0)
# Doesn't cross midnight. start=21, end=22. start < nightStart(22), end = nightStart.
# Code: elif startDecimal < nightStart and endDecimal > nightStart: nightH = endDecimal - nightStart = 22 - 22 = 0
report("BONUS-21-22", "PASS" if t == 1 and n == 0 else "FAIL", (1, 0), (t, n),
       "21-22: 1h regular (night starts at 22:00)")

# 22:00-23:00 = 1h total, 1h night
t, n = calc_night_hours_custom(22, 0, 23, 0)
report("BONUS-22-23", "PASS" if t == 1 and n == 1 else "FAIL", (1, 1), (t, n))

# 00:00-00:00 treated as 24h in the app's 24h mode, but custom: end=0, start=0
# crosses_midnight: 0 <= 0 = True. Total = (24-0)+0 = 24. Night: (24-22)+6 = 8
t, n = calc_night_hours_custom(0, 0, 0, 0)
report("BONUS-00-00", "PASS" if t == 24 and n == 8 else "FAIL", (24, 8), (t, n),
       "00:00-00:00 should be treated as 24h shift")


# ═══════════════════════════════════════════════════════════════════
# SUMMARY
# ═══════════════════════════════════════════════════════════════════
print("\n" + "=" * 70)
print("RESUMEN DE AUDITORÍA")
print("=" * 70)

passed = sum(1 for r in results if r["status"] == "PASS")
failed = sum(1 for r in results if r["status"] == "FAIL")
total = len(results)

print(f"\nTotal: {total} | PASS: {passed} | FAIL: {failed}")

if failed > 0:
    print("\n❌ CASOS FALLIDOS:")
    for r in results:
        if r["status"] == "FAIL":
            print(f"  • {r['case']}: expected={r['expected']}, actual={r['actual']}")
            if r.get("notes"):
                print(f"    → {r['notes']}")
else:
    print("\n✅ Todos los casos PASARON")

print()