import { useSegments } from 'expo-router';
import { useEffect, useRef } from 'react';
import { trackAnalytics } from './client';
import { normalizeRouteTemplate } from './route';

export function AnalyticsPageviewBridge(): null {
  const segments = useSegments();
  const routeTemplate = normalizeRouteTemplate(segments);
  const previousRouteTemplate = useRef<string | null>(null);

  useEffect(() => {
    if (previousRouteTemplate.current === routeTemplate) {
      return;
    }

    previousRouteTemplate.current = routeTemplate;
    trackAnalytics('$pageview', { $pathname: routeTemplate });
  }, [routeTemplate]);

  return null;
}
