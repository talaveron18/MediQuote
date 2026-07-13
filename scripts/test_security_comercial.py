"""
Security test: comercial cannot inject internal fields via POST /api/budgets
"""
import requests, json, sys, time

BASE = 'http://localhost:3000'
com_cookies = {'gasi_session': 'comercial@gasi.local'}
admin_cookies = {'gasi_session': 'admin@gasi.local'}

# 1. Get a client ID
r_clients = requests.get(f'{BASE}/api/clients', cookies=com_cookies)
clients_data = r_clients.json()
clients = clients_data.get('clients', clients_data) if isinstance(clients_data, dict) else clients_data
client_id = clients[0]['id'] if clients else None
if not client_id:
    print("FAIL: No client found"); sys.exit(1)
print(f"Using client: {client_id}")

# 2. POST budget as commercial with INJECTED internal fields
injected_blocks = [
    {
        'serviceName': 'Servicio seguro',
        'professionalCategory': 'Medico',
        'puestosSimultaneos': 1,
        'plantillaSeleccionada': 1,
        'pricePerHour': 35,
        'dateMode': 'range',
        'dateRangeStart': '2026-08-01',
        'dateRangeEnd': '2026-08-31',
        'daysOfWeek': [1, 2, 3, 4, 5],
        'excludeSundays': True,
        'excludeHolidays': True,
        'shiftType': 'morning',
        'hoursPerDay': 8,
        'breakMinutes': 0,
        'unitType': 'hora',
        'quantity': 1,
        'enabledSurcharges': [],
        # INJECTED internal fields — should NOT be saved
        'internalCostPerHour': 999.99,
        'internalMargin': 88.88,
    }
]

r = requests.post(f'{BASE}/api/budgets', cookies=com_cookies, json={
    'clientId': client_id,
    'description': 'Test seguridad comercial',
    'subtotal': 100,
    'totalSurcharges': 0,
    'discountPercent': 0,
    'discountAmount': 0,
    'ivaPercent': 21,
    'ivaAmount': 21,
    'totalFinal': 121,
    'serviceBlocks': injected_blocks,
    # INJECTED internal field on budget level
    'internalNotes': 'ESTO NO DEBERIA GUARDARSE DESDE COMERCIAL',
})

print(f"POST status: {r.status_code}")
assert r.status_code == 201, f"Expected 201, got {r.status_code}"

budget = r.json().get('budget', {})
budget_id = budget.get('id')
budget_code = budget.get('code')
print(f"Budget created: {budget_code} (id={budget_id})")

# 3. Verify response does NOT contain injected fields
assert 'internalNotes' not in budget, "FAIL: internalNotes in commercial response"
print("OK: internalNotes not in commercial response")

for sb in budget.get('serviceBlocks', []):
    assert 'internalCostPerHour' not in sb, f"FAIL: internalCostPerHour in block response: {sb}"
    assert 'internalMargin' not in sb, f"FAIL: internalMargin in block response: {sb}"
print("OK: no internal fields in commercial response blocks")

# 4. Verify DB: query as admin to see raw data
time.sleep(1)  # Wait for async export
r_admin = requests.get(f'{BASE}/api/budgets?search={budget_code}', cookies=admin_cookies)
admin_budgets = r_admin.json().get('budgets', [])
found = [b for b in admin_budgets if b.get('code') == budget_code]
assert len(found) == 1, f"Budget not found in admin list"

admin_budget = found[0]

# Check internalNotes was NOT saved
notes = admin_budget.get('internalNotes')
assert notes is None or notes == '', f"FAIL: internalNotes was saved as '{notes}' — commercial should not be able to set it"
print(f"OK: internalNotes not saved (value: {repr(notes)})")

# Check service blocks in DB don't have injected values
blocks = admin_budget.get('serviceBlocks', [])
# Admin sees full blocks, but the injected values should have been stripped before save
for sb in blocks:
    cost = sb.get('internalCostPerHour')
    margin = sb.get('internalMargin')
    # After stripInternalFields, these should be null (serializeServiceBlockData maps them with ?? null)
    assert cost != 999.99, f"FAIL: injected internalCostPerHour=999.99 was saved in DB!"
    assert margin != 88.88, f"FAIL: injected internalMargin=88.88 was saved in DB!"
print(f"OK: injected values NOT in DB blocks (checked {len(blocks)} blocks)")
if blocks:
    print(f"  Block internalCostPerHour={blocks[0].get('internalCostPerHour')}, internalMargin={blocks[0].get('internalMargin')}")

# 5. Extra: verify admin CAN set internalNotes
r_admin_create = requests.post(f'{BASE}/api/budgets', cookies=admin_cookies, json={
    'clientId': client_id,
    'description': 'Test admin puede setear internalNotes',
    'subtotal': 200,
    'totalSurcharges': 0,
    'discountPercent': 0,
    'discountAmount': 0,
    'ivaPercent': 21,
    'ivaAmount': 42,
    'totalFinal': 242,
    'internalNotes': 'Nota interna del admin - SI debe guardarse',
    'serviceBlocks': [{
        'serviceName': 'Servicio admin',
        'professionalCategory': 'Medico',
        'puestosSimultaneos': 1,
        'pricePerHour': 35,
        'dateMode': 'range',
        'dateRangeStart': '2026-08-01',
        'dateRangeEnd': '2026-08-31',
        'daysOfWeek': [1, 2, 3, 4, 5],
        'excludeSundays': True,
        'excludeHolidays': True,
        'shiftType': 'morning',
        'hoursPerDay': 8,
        'breakMinutes': 0,
        'unitType': 'hora',
        'quantity': 1,
        'enabledSurcharges': [],
        'internalCostPerHour': 22.0,
        'internalMargin': 37.1,
    }],
})
assert r_admin_create.status_code == 201
admin_budget_2 = r_admin_create.json().get('budget', {})
assert admin_budget_2.get('internalNotes') == 'Nota interna del admin - SI debe guardarse', \
    f"FAIL: admin internalNotes not saved: {admin_budget_2.get('internalNotes')}"
print("OK: admin CAN set internalNotes")

admin_blocks = admin_budget_2.get('serviceBlocks', [])
admin_block_cost = admin_blocks[0].get('internalCostPerHour') if admin_blocks else None
admin_block_margin = admin_blocks[0].get('internalMargin') if admin_blocks else None
assert admin_block_cost == 22.0, f"FAIL: admin internalCostPerHour not saved: {admin_block_cost}"
assert admin_block_margin == 37.1, f"FAIL: admin internalMargin not saved: {admin_block_margin}"
print(f"OK: admin CAN set internalCostPerHour={admin_block_cost} and internalMargin={admin_block_margin}")

print("\n=== ALL SECURITY TESTS PASSED ===")