import { useSegments } from 'expo-router';
import { useEffect, useRef } from 'react';
import { capturePageview } from './client';
import { isNewRouteTemplate, normalizeRouteTemplate } from './route';

export function AnalyticsPageviewBridge(): null {
  const segments = useSegments();
  const routeTemplate = normalizeRouteTemplate(segments);
  const previousRouteTemplate = useRef<string | null>(null);

  useEffect(() => {
    if (!isNewRouteTemplate(previousRouteTemplate.current, routeTemplate)) {
      return;
    }

    previousRouteTemplate.current = routeTemplate;
    capturePageview(routeTemplate);
  }, [routeTemplate]);

  return null;
}
