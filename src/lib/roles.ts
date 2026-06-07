import { UserRole } from '@/types';

/** Vrai si rôle = super-admin (transverse, voit tous les domaines). */
export function isSuperAdmin(role: UserRole | string | undefined): boolean {
  return role === UserRole.ADMIN;
}

/** Super-ADMIN OU ADMIN_TRANSIT. */
export function isAdminTransit(role: UserRole | string | undefined): boolean {
  return role === UserRole.ADMIN || role === UserRole.ADMIN_TRANSIT;
}

/** Super-ADMIN OU ADMIN_LOGISTIQUE. */
export function isAdminLogistique(role: UserRole | string | undefined): boolean {
  return role === UserRole.ADMIN || role === UserRole.ADMIN_LOGISTIQUE;
}

/** N'importe lequel des 3 rôles admin (super ou scopé). */
export function isAnyAdmin(role: UserRole | string | undefined): boolean {
  return (
    role === UserRole.ADMIN ||
    role === UserRole.ADMIN_TRANSIT ||
    role === UserRole.ADMIN_LOGISTIQUE
  );
}
