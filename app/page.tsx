import Script from 'next/script';
import Game from './game';

export default function Page() {
  return (
    <>
      <Script
        id="google-adsense"
        async
        strategy="afterInteractive"
        src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1867786717520003"
        crossOrigin="anonymous"
      />
      <Game />
    </>
  );
}
