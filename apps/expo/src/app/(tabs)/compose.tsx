import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function ComposeScreen() {
  return (
    <View className="bg-background flex-1">
      <SafeAreaView className="flex-1 justify-center gap-3 px-6" edges={['top']}>
        <Text className="text-muted-foreground text-xs font-semibold tracking-[1.6px] uppercase">
          KOSMO
        </Text>
        <Text className="text-foreground text-5xl leading-[44px] font-bold">글쓰기</Text>
        <Text className="text-secondary-foreground max-w-90 text-base leading-6">
          새 게시물을 작성하고 공유합니다.
        </Text>
      </SafeAreaView>
    </View>
  );
}
