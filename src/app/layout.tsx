// src/app/layout.tsx
import './globals.css';
import { SocketProvider } from '@/contexts/SocketContext';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Cabo Card Game Online',
  description: 'Mainkan game kartu Cabo seru bersama teman secara online',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#1a1a1a' },
    { media: '(prefers-color-scheme: light)', color: '#f8fafc' },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body className={`${inter.className} antialiased h-[100dvh] min-h-[100dvh] transition-colors duration-200 overflow-x-hidden`}>
        <ThemeProvider>
          <LanguageProvider>
            <SocketProvider>
              {children}
            </SocketProvider>
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}