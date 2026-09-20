import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { AppShell } from '../components/AppShell';
import { UserProvider } from '../lib/user-context';
import './globals.css';

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Losung360 Procure-to-Pay',
  description: 'Phase 0 testing UI for the Losung360 P2P module',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full bg-stone-50 dark:bg-stone-950">
        <UserProvider>
          <AppShell>{children}</AppShell>
        </UserProvider>
      </body>
    </html>
  );
}
