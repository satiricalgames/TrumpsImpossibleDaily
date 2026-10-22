'use client';

import { useEffect, useRef, useState } from 'react';

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
  const adElement = useRef<HTMLModElement | null>(null);
  const [status, setStatus] = useState<'pending' | 'filled' | 'unfilled'>('pending');

  useEffect(() => {
    if (requested.current) return;
    requested.current = true;

    const element = adElement.current;
    const readStatus = () => {
      const nextStatus = element?.getAttribute('data-ad-status');
      if (nextStatus === 'filled' || nextStatus === 'unfilled') setStatus(nextStatus);
    };
    const observer = element
      ? new MutationObserver(readStatus)
      : null;

    observer?.observe(element!, { attributes: true, attributeFilter: ['data-ad-status'] });

    try {
      window.adsbygoogle = window.adsbygoogle || [];
      window.adsbygoogle.push({});
    } catch {
      requested.current = false;
    }

    readStatus();
    const blockedOrSlowTimeout = window.setTimeout(() => {
      if (!element?.getAttribute('data-ad-status')) setStatus('unfilled');
    }, 8000);

    return () => {
      observer?.disconnect();
      window.clearTimeout(blockedOrSlowTimeout);
    };
  }, [slot]);

  return (
    <aside className={`adsense-placement adsense-${status} ${className}`.trim()} aria-label={label}>
      <span className="adsense-label">{status === 'pending' ? 'ADVERTISEMENT LOADING' : 'ADVERTISEMENT'}</span>
      <ins
        ref={adElement}
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
