import type { DefaultSession } from 'next-auth';
import type { CaisseType, UserRole } from '@/types';

declare module 'next-auth' {
  interface Session {
    user: DefaultSession['user'] & {
      id: string;
      nom: string;
      role: UserRole;
      caisse?: CaisseType;
      caisseCompteId?: string;
    };
  }

  interface User {
    nom: string;
    role: UserRole;
    caisse?: CaisseType;
    caisseCompteId?: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    nom?: string;
    email?: string;
    role?: UserRole;
    caisse?: CaisseType;
    caisseCompteId?: string;
  }
}
