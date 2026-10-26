import { randomUUID } from 'node:crypto'
import { db } from './db'

// Shared SQLite lease + fencing. No remote operation holds a SQLite transaction.
// A crashed request releases its lease after 60s; blocked remains until explicit recovery.
export function claimMembership(userId: string): string | null {
  const owner = randomUUID()
  const result = db.prepare(`INSERT INTO membership_state (auth_user_id, owner, expires)
    VALUES (?, ?, ?) ON CONFLICT(auth_user_id) DO UPDATE SET owner=excluded.owner, expires=excluded.expires
    WHERE membership_state.expires < ?`).run(userId, owner, Date.now() + 60_000, Date.now())
  return result.changes ? owner : null
}
export function fenceMembership(userId: string, owner: string): void {
  const row = db.prepare('SELECT owner, expires FROM membership_state WHERE auth_user_id=?').get(userId) as { owner: string; expires: number }
  if (row.owner !== owner || row.expires <= Date.now()) throw new Error('membership lease expired')
}
export function releaseMembership(userId: string, owner: string) {
  db.prepare('UPDATE membership_state SET owner=NULL, expires=0 WHERE auth_user_id=? AND owner=?').run(userId, owner)
}
export function blockMembership(userId: string, owner: string, version: number, cleanupId: string | null) {
  db.transaction(() => {
    fenceMembership(userId, owner)
    db.prepare('UPDATE membership_state SET blocked=1, epoch=epoch+1, version=?, cleanup_id=? WHERE auth_user_id=?').run(version, cleanupId, userId)
  })()
}
export function unblockMembership(userId: string, owner: string, version: number) {
  db.transaction(() => {
    fenceMembership(userId, owner)
    db.prepare('UPDATE membership_state SET blocked=0, epoch=epoch+1, version=?, cleanup_id=NULL, rejoin_version=NULL WHERE auth_user_id=?').run(version, userId)
  })()
}
export function membershipEpoch(userId: string): number {
  const row = db.prepare('SELECT blocked, epoch FROM membership_state WHERE auth_user_id=?').get(userId) as { blocked: number; epoch: number } | undefined
  if (row?.blocked) throw new Error('membership blocked')
  return row?.epoch ?? 0
}

export function pendingRejoin(userId: string): number | null {
  return (db.prepare('SELECT rejoin_version FROM membership_state WHERE auth_user_id=?').get(userId) as { rejoin_version: number | null } | undefined)?.rejoin_version ?? null
}
export function prepareRejoin(userId: string, owner: string, version: number) {
  db.transaction(() => {
    fenceMembership(userId, owner)
    db.prepare('UPDATE membership_state SET rejoin_version=? WHERE auth_user_id=?').run(version + 1, userId)
  })()
}
