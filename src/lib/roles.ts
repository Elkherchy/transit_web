import { UserRole } from '@/types';

/** Vrai si rôle = super-admin (transverse, voit tous les domaines). */
export function isSuperAdmin(role: UserRole | string | undefined): boolean {
  return role === UserRole.ADMIN;
}

/** Super-ADMIN OU ADMIN_TRANSIT. */
export function isAdminTransit(role: UserRole | string | undefined): boolean {
  return role === UserRole.ADMIN || role === UserRole.ADMIN_TRANSIT;
}

/** N'importe lequel des rôles admin. */
export function isAnyAdmin(role: UserRole | string | undefined): boolean {
  return role === UserRole.ADMIN || role === UserRole.ADMIN_TRANSIT;
}
