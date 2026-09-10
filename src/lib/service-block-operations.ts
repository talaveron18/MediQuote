import type { ServiceBlockInput } from '@/lib/types';

/**
 * Creates an independent editable copy of a service block.
 * Persisted identifiers are intentionally removed so cloning can never
 * masquerade as an update of the source row.
 */
export function cloneServiceBlock(block: ServiceBlockInput): ServiceBlockInput {
  return {
    ...block,
    id: undefined,
    specificDates: block.specificDates ? [...block.specificDates] : undefined,
    daysOfWeek: block.daysOfWeek ? [...block.daysOfWeek] : undefined,
    holidayTypesExcluded: block.holidayTypesExcluded ? [...block.holidayTypesExcluded] : undefined,
    enabledSurcharges: block.enabledSurcharges ? [...block.enabledSurcharges] : undefined,
  };
}

/** Insert an independent clone immediately after the source block. */
export function cloneServiceBlockAt(
  blocks: ServiceBlockInput[],
  index: number,
): ServiceBlockInput[] {
  if (!Number.isInteger(index) || index < 0 || index >= blocks.length) return blocks;
  const cloned = cloneServiceBlock(blocks[index]);
  return [...blocks.slice(0, index + 1), cloned, ...blocks.slice(index + 1)];
}

/**
 * Move a block by one position while preserving the other blocks verbatim.
 * Invalid/boundary moves are safe no-ops.
 */
export function moveServiceBlock(
  blocks: ServiceBlockInput[],
  index: number,
  direction: -1 | 1,
): ServiceBlockInput[] {
  if (!Number.isInteger(index) || index < 0 || index >= blocks.length) return blocks;
  const target = index + direction;
  if (target < 0 || target >= blocks.length) return blocks;

  const next = [...blocks];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
