import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function HomeScreen() {
  return (
    <View className="flex-1 bg-white">
      <SafeAreaView className="flex-1 justify-center gap-3 px-6">
        <Text className="text-primary text-xs font-semibold tracking-[1.6px] uppercase">KOSMO</Text>
        <Text className="text-[40px] leading-[44px] font-bold text-gray-900">
          Initial app shell
        </Text>
        <Text className="max-w-90 text-base leading-6 text-gray-600">
          The Expo starter content has been removed. Build from here.
        </Text>
      </SafeAreaView>
    </View>
  );
}
