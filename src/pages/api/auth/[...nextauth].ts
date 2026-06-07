import NextAuth from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { getNextAuthSecret } from '@/lib/nextAuthSecret';
import connectDB from '../../../lib/db';
import { User } from '../../../models';
import { UserRole } from '../../../types';

export default NextAuth({
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Mot de passe', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        try {
          await connectDB();
          const user = await User.findOne({ email: credentials.email }).select('+password');
          if (!user || !user.actif) return null;

          const isMatch = await bcrypt.compare(credentials.password, user.password);
          if (!isMatch) return null;

          return {
            id: user._id.toString(),
            email: user.email,
            name: user.nom,
            nom: user.nom,
            role: user.role as UserRole,
            caisse: user.caisse,
            caisseCompteId: user.caisseCompteId,
          };
        } catch (error) {
          console.error('[NextAuth] Erreur authorize:', error instanceof Error ? error.message : 'unknown');
          return null;
        }
      },
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: 7 * 24 * 60 * 60, // 7 days
  },
  pages: {
    signIn: '/login',
  },
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
        token.sub = user.id;
        token.role = user.role;
        token.caisse = user.caisse;
        token.caisseCompteId = user.caisseCompteId;
        const nomVal = (user as { nom?: string }).nom ?? user.name;
        token.nom = nomVal == null ? undefined : String(nomVal);
        token.email = user.email ?? undefined;
      }
      if (trigger === 'update' && session) {
        if (typeof (session as { nom?: string }).nom === 'string') {
          token.nom = (session as { nom: string }).nom;
        }
        if (typeof (session as { email?: string }).email === 'string') {
          token.email = (session as { email: string }).email;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as UserRole;
        session.user.caisse = token.caisse;
        session.user.caisseCompteId = token.caisseCompteId as string | undefined;
        const nom = (token.nom as string) || session.user.name || '';
        session.user.nom = nom;
        session.user.name = nom;
        if (token.email) {
          session.user.email = token.email as string;
        }
      }
      return session;
    },
  },
  secret: getNextAuthSecret(),
});
