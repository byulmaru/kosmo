import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { accountActions, currentProfile, secondaryProfiles } from './accountData';

type Props = {
  onClose?: () => void;
};

export default function AccountMenuContent({ onClose }: Props) {
  const handlePress = () => {
    onClose?.();
  };

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.avatar}>
            <Text style={styles.avatarLabel}>K</Text>
          </View>
          <View style={styles.cardBody}>
            <Text style={styles.cardTitle}>{currentProfile.name}</Text>
            <Text style={styles.cardHandle}>{currentProfile.handle}</Text>
          </View>
        </View>
        <Text style={styles.cardDescription}>{currentProfile.bio}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>프로필 전환</Text>
        {secondaryProfiles.map((profile) => (
          <Pressable
            key={profile.id}
            style={({ pressed }) => [styles.rowButton, pressed && styles.rowButtonPressed]}
          >
            <View style={styles.rowIcon}>
              <Ionicons name="swap-horizontal" size={18} color="#0f172a" />
            </View>
            <View style={styles.rowBody}>
              <Text style={styles.rowTitle}>{profile.name}</Text>
              <Text style={styles.rowMeta}>{profile.handle}</Text>
            </View>
          </Pressable>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>빠른 메뉴</Text>
        {accountActions.map((action) => (
          <Pressable
            key={action.id}
            onPress={handlePress}
            style={({ pressed }) => [styles.rowButton, pressed && styles.rowButtonPressed]}
          >
            <View style={styles.rowIcon}>
              <Ionicons name={action.icon} size={18} color="#0f172a" />
            </View>
            <Text style={styles.rowTitle}>{action.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 20,
  },
  card: {
    borderRadius: 20,
    backgroundColor: '#eff6ff',
    padding: 18,
    gap: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563eb',
  },
  avatarLabel: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '800',
  },
  cardBody: {
    gap: 2,
  },
  cardTitle: {
    color: '#0f172a',
    fontSize: 17,
    fontWeight: '700',
  },
  cardHandle: {
    color: '#475569',
    fontSize: 14,
  },
  cardDescription: {
    color: '#334155',
    fontSize: 14,
    lineHeight: 20,
  },
  section: {
    gap: 10,
  },
  sectionLabel: {
    color: '#64748b',
    fontSize: 13,
    fontWeight: '700',
  },
  rowButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  rowButtonPressed: {
    backgroundColor: '#f8fafc',
  },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e2e8f0',
  },
  rowBody: {
    gap: 2,
  },
  rowTitle: {
    color: '#0f172a',
    fontSize: 16,
    fontWeight: '600',
  },
  rowMeta: {
    color: '#64748b',
    fontSize: 13,
  },
});
