import type { Metadata, Viewport } from 'next';
import './globals.css';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Trump's Impossible Game",
  description: 'A deliberately rigged retro political parody game where facts do not necessarily help.',
  applicationName: "Trump's Impossible Game",
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/icon-192.png',
  },
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Impossible Game' },
  openGraph: {
    title: "Trump's Impossible Game",
    description: "The game is rigged. The answers change. Facts don't help.",
    type: 'website',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: "Trump's Impossible Game retro title card" }],
  },
  twitter: {
    card: 'summary_large_image',
    title: "Trump's Impossible Game",
    description: "The game is rigged. The answers change. Facts don't help.",
    images: ['/og.png'],
  },
};

export const viewport: Viewport = {
  themeColor: '#061a45',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
