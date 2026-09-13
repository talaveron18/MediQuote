type BudgetBody = Record<string, unknown>

const CREATE_FIELDS = new Set([
  'clientId', 'status', 'validUntil', 'description', 'clientNotes', 'internalNotes', 'calculationToken',
])

const ECONOMIC_NUMBER_FIELDS = [
  'subtotal', 'totalSurcharges', 'discountPercent', 'discountAmount', 'ivaPercent', 'ivaAmount', 'totalFinal',
] as const

const ECONOMIC_LOCATION_FIELDS = [
  'serviceLocationId', 'serviceAutonomousCommunity', 'serviceProvince', 'serviceMunicipality',
] as const

const UPDATE_FIELDS = new Set([
  'id', 'serviceBlocks', 'calculationToken', 'clientId', 'status', 'validUntil', 'description',
  'clientNotes', 'internalNotes', ...ECONOMIC_NUMBER_FIELDS, ...ECONOMIC_LOCATION_FIELDS,
])

function unknownField(body: BudgetBody, allowed: Set<string>): string | null {
  return Object.keys(body).find((key) => !allowed.has(key)) ?? null
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isNullableString(value: unknown): boolean {
  return value === undefined || value === null || typeof value === 'string'
}

function isOptionalFiniteNumber(value: unknown): boolean {
  return value === undefined || (typeof value === 'number' && Number.isFinite(value))
}

export function validateBudgetCreateBody(body: BudgetBody): string | null {
  const unknown = unknownField(body, CREATE_FIELDS)
  if (unknown) return `Campo no permitido en presupuesto: ${unknown}`
  if (!isNonEmptyString(body.clientId)) return 'El cliente del presupuesto debe ser un identificador no vacío'
  if (!isNonEmptyString(body.calculationToken)) return 'La cotización económica debe incluir un token no vacío'
  for (const key of ['validUntil', 'description', 'clientNotes', 'internalNotes'] as const) {
    if (!isNullableString(body[key])) return `${key} debe ser texto o null`
  }
  return null
}

export function validateBudgetUpdateBody(body: BudgetBody): string | null {
  const unknown = unknownField(body, UPDATE_FIELDS)
  if (unknown) return `Campo no permitido en presupuesto: ${unknown}`
  if (!isNonEmptyString(body.id)) return 'El ID del presupuesto debe ser texto no vacío'
  if (body.calculationToken !== undefined && !isNonEmptyString(body.calculationToken)) {
    return 'La cotización económica debe incluir un token no vacío cuando se envía'
  }
  if (body.serviceBlocks !== undefined && !Array.isArray(body.serviceBlocks)) {
    return 'serviceBlocks debe ser una lista cuando se envía'
  }
  if (body.clientId !== undefined && !isNonEmptyString(body.clientId)) {
    return 'El cliente del presupuesto debe ser un identificador no vacío cuando se modifica'
  }
  for (const key of ['validUntil', 'description', 'clientNotes', 'internalNotes'] as const) {
    if (!isNullableString(body[key])) return `${key} debe ser texto o null`
  }
  for (const key of ECONOMIC_NUMBER_FIELDS) {
    if (!isOptionalFiniteNumber(body[key])) return `${key} debe ser un número finito cuando se envía`
  }
  for (const key of ECONOMIC_LOCATION_FIELDS) {
    const value = body[key]
    const nullable = key === 'serviceMunicipality'
    if (value !== undefined && !(typeof value === 'string' || (nullable && value === null))) {
      return `${key} debe ser texto${nullable ? ' o null' : ''} cuando se envía`
    }
  }
  return null
}
