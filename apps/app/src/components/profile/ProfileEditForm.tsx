import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing, typography } from '@/theme/tokens';
import { TextArea, TextField } from '../ui/TextField';
import { ProfileEditImageFields } from './ProfileEditImageFields';
import { validateProfileEditDraft } from './profileEditState';
import { ProfileTagEditor } from './ProfileTagEditor';
import type { ProfileEditDraft, ProfileEditFieldErrors } from './profileEditState';

export type ProfileEditFormProps = {
  disabled?: boolean;
  onAvatarEdit?: () => void;
  onChange: (next: ProfileEditDraft) => void;
  onHeaderEdit?: () => void;
  serverErrors?: ProfileEditFieldErrors;
  value: ProfileEditDraft;
};

function countCodePoints(value: string): number {
  return [...value].length;
}

function resolveFieldError(local?: string, server?: string): string | undefined {
  return server ?? local;
}

function FieldError({ message }: { message?: string }) {
  const theme = useTheme();

  if (!message) {
    return null;
  }

  return (
    <Text accessibilityRole="alert" style={[styles.error, { color: theme.danger }]}>
      {message}
    </Text>
  );
}

export function ProfileEditForm({
  disabled = false,
  onAvatarEdit,
  onChange,
  onHeaderEdit,
  serverErrors,
  value,
}: ProfileEditFormProps) {
  const theme = useTheme();
  const localErrors = validateProfileEditDraft(value);
  const displayNameError = resolveFieldError(localErrors.displayName, serverErrors?.displayName);
  const bioError = resolveFieldError(localErrors.bio, serverErrors?.bio);

  return (
    <View style={styles.root}>
      <ProfileEditImageFields
        avatar={value.avatar}
        disabled={disabled}
        header={value.header}
        onAvatarEdit={onAvatarEdit}
        onHeaderEdit={onHeaderEdit}
      />

      <View style={styles.imageErrors}>
        <FieldError message={serverErrors?.header} />
        <FieldError message={serverErrors?.avatar} />
      </View>

      <View style={styles.fields}>
        <View style={styles.field}>
          <TextField
            accessibilityLabel="표시 이름"
            editable={!disabled}
            error={displayNameError}
            label="표시 이름"
            onChangeText={(displayName) => onChange({ ...value, displayName })}
            value={value.displayName}
          />
          <Text style={[styles.counter, { color: theme.textSecondary }]}>
            {countCodePoints(value.displayName.trim())}/40
          </Text>
        </View>

        <View style={styles.field}>
          <TextArea
            accessibilityLabel="소개"
            editable={!disabled}
            error={bioError}
            label="소개"
            onChangeText={(bio) => onChange({ ...value, bio })}
            value={value.bio}
          />
          <Text style={[styles.counter, { color: theme.textSecondary }]}>
            {countCodePoints(value.bio)}/500
          </Text>
        </View>

        <View style={styles.field}>
          <ProfileTagEditor
            disabled={disabled}
            onChange={(tags) => onChange({ ...value, tags })}
            tags={value.tags}
          />
          <FieldError message={serverErrors?.tags} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
  },
  imageErrors: {
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
  },
  fields: {
    gap: spacing.xl,
    paddingBottom: spacing.xxxl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
  },
  field: {
    gap: spacing.xs,
  },
  counter: {
    alignSelf: 'flex-end',
    fontFamily: 'SUIT',
    ...typography.xsm,
  },
  error: {
    fontFamily: 'SUIT',
    ...typography.xsm,
  },
});
