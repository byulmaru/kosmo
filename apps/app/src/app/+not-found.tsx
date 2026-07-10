import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { StateView } from '@/components/ui/StateView';
import { spacing } from '@/theme/tokens';

export default function NotFoundScreen() {
  const router = useRouter();
  return (
    <View style={styles.root}>
      <StateView description="주소를 다시 확인해 주세요." title="페이지를 찾을 수 없어요" />
      <Button onPress={() => router.replace('/')} tone="secondary">
        처음으로
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center', padding: spacing.xl },
});
