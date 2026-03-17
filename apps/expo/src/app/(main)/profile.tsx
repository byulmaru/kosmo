import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AccountMenuContent from '@/components/menu/AccountMenuContent';

export default function MenuPage() {
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: insets.top + 20,
          paddingBottom: insets.bottom + 24,
        },
      ]}
    >
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Account</Text>
        <Text style={styles.title}>메뉴</Text>
        <Text style={styles.description}>
          현재 프로필 전환과 계정 관련 작업을 한 곳에서 다루는 화면입니다.
        </Text>
      </View>
      <AccountMenuContent />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  content: {
    paddingHorizontal: 20,
    gap: 24,
  },
  header: {
    gap: 8,
  },
  eyebrow: {
    color: '#2563eb',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  title: {
    color: '#0f172a',
    fontSize: 32,
    fontWeight: '800',
  },
  description: {
    color: '#475569',
    fontSize: 15,
    lineHeight: 22,
  },
});
