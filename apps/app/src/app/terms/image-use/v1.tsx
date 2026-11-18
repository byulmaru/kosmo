import { parseMediaUseTermsRights } from '@kosmo/core/media-metadata';
import { Stack, useLocalSearchParams } from 'expo-router';
import { ImageUseTermsPage } from '@/components/public-policy/ImageUseTermsPage';

const TITLE = 'KOSMO 이미지 이용 조건 v1';

export default function ImageUseTermsRoute() {
  const parameters = useLocalSearchParams();

  return (
    <>
      <Stack.Screen options={{ title: TITLE }} />
      <ImageUseTermsPage rights={parseMediaUseTermsRights(parameters)} />
    </>
  );
}
