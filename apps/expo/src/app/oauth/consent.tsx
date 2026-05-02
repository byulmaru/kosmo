import { Text, View } from 'react-native';

export default function OAuthConsent() {
  return (
    <View className="bg-background flex-1 justify-center p-6">
      <Text className="text-foreground text-2xl font-bold">앱 연결 승인</Text>
      <Text className="text-muted-foreground mt-3 text-base">
        서드파티 앱 권한 승인 화면은 OAuth authorization request 저장소와 연결되면 여기에서 앱 이름,
        요청 권한, 사용할 프로필을 보여주고 승인 또는 거부를 처리합니다.
      </Text>
    </View>
  );
}
