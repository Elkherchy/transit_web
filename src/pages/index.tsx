import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';

export default function Home() {
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'loading') return;
    if (status === 'authenticated') {
      void router.replace('/dashboard');
    } else {
      void router.replace('/login');
    }
  }, [status, router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
    </div>
  );
}
