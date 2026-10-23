import type { CSSProperties } from 'react';
import type { Metadata, Viewport } from 'next';
import './globals.css';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Trump's Impossible Daily",
  description: 'Five daily questions unlock a weekly satirical hidden-Trump investigation.',
  applicationName: "Trump's Impossible Daily",
  manifest: `${basePath}/manifest.webmanifest`,
  icons: {
    icon: [
      { url: `${basePath}/icon-192.png`, sizes: '192x192', type: 'image/png' },
      { url: `${basePath}/icon-512.png`, sizes: '512x512', type: 'image/png' },
    ],
    apple: `${basePath}/icon-192.png`,
  },
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Impossible Daily' },
  openGraph: {
    title: "Trump's Impossible Daily",
    description: "Five questions. One hidden Trump. Zero reliable facts.",
    type: 'website',
    images: [{ url: `${basePath}/og.png`, width: 1200, height: 630, alt: "Trump's Impossible Game retro title card" }],
  },
  twitter: {
    card: 'summary_large_image',
    title: "Trump's Impossible Daily",
    description: "Five questions. One hidden Trump. Zero reliable facts.",
    images: [`${basePath}/og.png`],
  },
};

export const viewport: Viewport = {
  themeColor: '#061a45',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const backgroundStyle = {
    '--white-house-image': `url("${basePath}/white-house.jpg")`,
  } as CSSProperties;

  return (
    <html lang="en">
      <body style={backgroundStyle}>{children}</body>
    </html>
  );
}
