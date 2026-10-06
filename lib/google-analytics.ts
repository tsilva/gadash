export const ANALYTICS_CONSENT_COOKIE = "gadash_analytics_consent";

export function getGoogleAnalyticsBootstrap(
  measurementId: string | undefined,
  consent: string | undefined,
): string | null {
  const id = measurementId?.trim();
  if (consent !== "granted" || !id || !/^G-[A-Z0-9]+$/.test(id)) return null;

  return `
    window.dataLayer = window.dataLayer || [];
    function gtag(){window.dataLayer.push(arguments);}
    gtag('consent', 'default', {
      analytics_storage: 'denied',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied'
    });
    gtag('consent', 'update', {analytics_storage: 'granted'});
    gtag('js', new Date());
    gtag('config', ${JSON.stringify(id)}, {
      allow_google_signals: false,
      allow_ad_personalization_signals: false
    });
  `;
}
