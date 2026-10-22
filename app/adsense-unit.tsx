'use client';

import { useEffect, useRef } from 'react';

const ADSENSE_CLIENT = 'ca-pub-1867786717520003';

declare global {
  interface Window {
    adsbygoogle?: Array<Record<string, unknown>>;
  }
}

export default function AdSenseUnit({
  slot,
  label,
  className = '',
}: {
  slot: string;
  label: string;
  className?: string;
}) {
  const requested = useRef(false);

  useEffect(() => {
    if (requested.current) return;
    requested.current = true;

    try {
      window.adsbygoogle = window.adsbygoogle || [];
      window.adsbygoogle.push({});
    } catch {
      requested.current = false;
    }
  }, [slot]);

  return (
    <aside className={`adsense-placement ${className}`.trim()} aria-label={label}>
      <span className="adsense-label">ADVERTISEMENT</span>
      <ins
        className="adsbygoogle"
        style={{ display: 'block' }}
        data-ad-client={ADSENSE_CLIENT}
        data-ad-slot={slot}
        data-ad-format="horizontal"
        data-full-width-responsive="true"
      />
    </aside>
  );
}
