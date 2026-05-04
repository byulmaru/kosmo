import { Link } from 'expo-router';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function MenuScreen() {
  return (
    <View className="bg-background flex-1">
      <SafeAreaView className="flex-1 justify-center gap-3 px-6" edges={['top']}>
        <Text className="text-muted-foreground text-xs font-semibold tracking-[1.6px] uppercase">
          KOSMO
        </Text>
        <Text className="text-foreground text-5xl leading-[44px] font-bold">메뉴</Text>
        <Text className="text-secondary-foreground max-w-90 text-base leading-6">
          프로필과 설정 등 주요 메뉴를 확인합니다.
        </Text>
        <Link href="/login" className="text-primary text-base font-bold">
          로그인 테스트
        </Link>
      </SafeAreaView>
    </View>
  );
}
