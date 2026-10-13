import type { TableId } from '../types'

/** Collision radius of a pen, in table units. */
export const PEN_RADIUS = 26

export interface TableDef {
  id: TableId
  name: string
  width: number
  height: number
  shape: 'rect' | 'round'
}

export const TABLES: Record<TableId, TableDef> = {
  classic: { id: 'classic', name: 'Classic desk', width: 800, height: 500, shape: 'rect' },
  ledge: { id: 'ledge', name: 'Narrow ledge', width: 800, height: 220, shape: 'rect' },
  round: { id: 'round', name: 'Round table', width: 520, height: 520, shape: 'round' },
}

/** Distance from (x, y) to the nearest edge of the playable area. Negative means off the table. */
export function edgeDistance(table: TableDef, inset: number, x: number, y: number): number {
  if (table.shape === 'round') {
    return table.width / 2 - inset - Math.hypot(x - table.width / 2, y - table.height / 2)
  }
  return Math.min(x - inset, table.width - inset - x, y - inset, table.height - inset - y)
}

/** A pen falls when its centre leaves the playable area. */
export function isOnTable(table: TableDef, inset: number, x: number, y: number): boolean {
  return edgeDistance(table, inset, x, y) >= 0
}

/** How far sudden death may shrink the table before it stops. */
export function maxInset(table: TableDef): number {
  return Math.min(table.width, table.height) / 2 - 70
}

export function spawnPositions(table: TableDef): [{ x: number; y: number }, { x: number; y: number }] {
  const cy = table.height / 2
  if (table.shape === 'round') {
    return [
      { x: table.width / 2 - 150, y: cy },
      { x: table.width / 2 + 150, y: cy },
    ]
  }
  return [
    { x: table.width * 0.22, y: cy },
    { x: table.width * 0.78, y: cy },
  ]
}
