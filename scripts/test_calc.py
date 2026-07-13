#!/usr/bin/env python3
"""Test cases I, L, M for GASI calculation engine."""
import json, urllib.request, sys

BASE = 'http://localhost:3000'
COOKIE = 'gasi_session=comercial@gasi.local'

def post_calc(blocks):
    data = json.dumps({'blocks': blocks}).encode()
    req = urllib.request.Request(
        f'{BASE}/api/calculations',
        data=data,
        headers={
            'Content-Type': 'application/json',
            'Cookie': COOKIE,
        },
        method='POST',
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read())
    except Exception as e:
        print(f'  ERROR: {e}')
        sys.exit(1)

def test_i():
    """Médico 3 meses, jul-sep, Lun-Vie, sin domingos/festivos"""
    r = post_calc([{
        'serviceName': 'Médico mañana',
        'professionalCategory': 'Médico',
        'puestosSimultaneos': 1,
        'pricePerHour': 35,
        'dateMode': 'range',
        'dateRangeStart': '2026-07-01',
        'dateRangeEnd': '2026-09-30',
        'daysOfWeek': [1, 2, 3, 4, 5, 6],  # Lun-Sab: 48h/sem → plantilla=2
        'excludeSundays': True,
        'excludeHolidays': True,
        'holidayTypesExcluded': ['nacional', 'autonomico'],
        'shiftType': 'morning',
        'hoursPerDay': 8,
        'breakMinutes': 0,
        'unitType': 'hora',
        'quantity': 1,
        'enabledSurcharges': [],
    }])
    b = r['blocks'][0]
    wd = b['totalWorkingDays']
    pm = b['plantillaMinimaRecomendada']
    sub = b['subtotal']
    dup = pm > 1 and 'max_weekly' in str(b.get('laborWarnings', []))
    print(f'  Days={wd} PlantillaMin={pm} Subtotal={sub:.2f} NoDupPorPlantilla={not dup}')
    assert pm >= 2, f'FAIL I: plantillaMin={pm}, debe ser >=2'
    assert not dup, 'FAIL: duplica subtotal por plantilla'
    print('  I: PASS\n')

def test_l():
    """2 puestos simultáneos, julio, Lun-Vie"""
    r = post_calc([{
        'serviceName': 'Enfermero x2',
        'professionalCategory': 'Enfermero',
        'puestosSimultaneos': 2,
        'pricePerHour': 22,
        'dateMode': 'range',
        'dateRangeStart': '2026-07-01',
        'dateRangeEnd': '2026-07-31',
        'daysOfWeek': [1, 2, 3, 4, 5, 6],  # Lun-Sab: 48h/sem → plantilla=2
        'excludeSundays': True,
        'excludeHolidays': True,
        'shiftType': 'morning',
        'hoursPerDay': 8,
        'breakMinutes': 0,
        'unitType': 'hora',
        'quantity': 1,
        'enabledSurcharges': [],
    }])
    b = r['blocks'][0]
    hp = b['hoursPerPosition']
    ch = b['coverageHours']
    sub = b['subtotal']
    print(f'  HoursPerPos={hp} Coverage={ch} Subtotal={sub:.2f}')
    assert ch == 2 * hp, f'FAIL L: coverage={ch} != 2*{hp}'
    assert sub == hp * 2 * 22, f'FAIL L: subtotal={sub} != {hp*2*22}'
    print('  L: PASS\n')

def test_m():
    """Turno 20:00-08:00, debe tener 8h nocturnas"""
    r = post_calc([{
        'serviceName': 'Guardia nocturna',
        'professionalCategory': 'TCAE',
        'puestosSimultaneos': 1,
        'pricePerHour': 14,
        'dateMode': 'range',
        'dateRangeStart': '2026-07-14',
        'dateRangeEnd': '2026-07-14',
        'daysOfWeek': [0, 1, 2, 3, 4, 5, 6],
        'excludeSundays': False,
        'excludeHolidays': True,
        'shiftType': 'custom',
        'shiftStartTime': '20:00',
        'shiftEndTime': '08:00',
        'hoursPerDay': 12,
        'breakMinutes': 0,
        'unitType': 'hora',
        'quantity': 1,
        'enabledSurcharges': [],
    }])
    b = r['blocks'][0]
    bd = b['shiftBreakdown']
    print(f'  Total={bd["total"]}h Night={bd["night"]}h Regular={bd["regular"]}h')
    assert bd['night'] == 8, f'FAIL M: night={bd["night"]}h, debe ser 8'
    assert bd['total'] == 12, f'FAIL M: total={bd["total"]}h, debe ser 12'
    print('  M: PASS\n')

if __name__ == '__main__':
    print('=== GASI Calculation Engine Tests ===\n')
    test_i()
    test_l()
    test_m()
    print('ALL PASSED')