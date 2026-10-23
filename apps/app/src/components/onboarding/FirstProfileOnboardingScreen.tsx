import { localProfileHandleSchema } from '@kosmo/core/validation';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { ProfileEditImageFields } from '@/components/profile/ProfileEditImageFields';
import { ProfileTagChip } from '@/components/profile/ProfileTagChip';
import { ProfileTagEditor } from '@/components/profile/ProfileTagEditor';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { RadioGroup, RadioOption } from '@/components/ui/RadioGroup';
import { TextArea, TextField } from '@/components/ui/TextField';
import { useSafeAreaPadding } from '@/components/ui/useSafeAreaPadding';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space, textStyles } from '@/theme/tokens';
import { FirstProfileOnboardingFrame } from './FirstProfileOnboardingFrame';
import { firstProfileSteps } from './firstProfileOnboardingState';
import type { ReactNode } from 'react';
import type { ProfileEditImageDraft } from '@/components/profile/profileEditState';
import type {
  FirstProfileDraft,
  FirstProfileErrors,
  FirstProfileStep,
} from './firstProfileOnboardingState';

const copy = {
  handle: {
    title: '나만의 핸들을\n정해 주세요',
    description: '코스모에서 내 프로필을 찾을 때 사용하는 아이디예요.',
  },
  details: {
    title: '나를 소개하는\n프로필을 꾸며 보세요',
    description: '프로필 사진과 표시될 이름, 짧은 소개를 넣어 주세요.',
  },
  tags: {
    title: '어떤 것들을\n좋아하나요?',
    description: '당신의 취향을 프로필에 태그로 남겨 보세요.',
  },
  posting: {
    title: '게시 설정',
    description: '게시물의 공개 범위와 팔로우 요청 방식을 정해 주세요.',
  },
  review: { title: '이 프로필로\n시작해 볼까요?', description: '입력한 내용을 확인해 주세요.' },
};
const visibilityOptions = [
  { value: 'PUBLIC', label: '전체 공개', description: '누구나 볼 수 있어요.' },
  { value: 'UNLISTED', label: '조용한 공개', description: '누구나 볼 수 있지만 검색되지 않아요.' },
  { value: 'FOLLOWERS', label: '팔로워만', description: '나를 팔로우하는 사람만 볼 수 있어요.' },
] as const;

export type FirstProfileOnboardingScreenProps = {
  avatar: ProfileEditImageDraft;
  header: ProfileEditImageDraft;
  busy: boolean;
  created: boolean;
  draft: FirstProfileDraft;
  errors: FirstProfileErrors;
  onChange: (value: FirstProfileDraft) => void;
  onComplete: () => void;
  onNext: () => void;
  onSkip: () => void;
  onAvatarEdit: () => void;
  onAvatarRemove: () => void;
  onAvatarRetry: () => void;
  onHeaderEdit: () => void;
  onHeaderRemove: () => void;
  onHeaderRetry: () => void;
  result: { kind: 'idle' | 'success' } | { kind: 'error'; message: string };
  startAction?: ReactNode;
  summary?: {
    draft: FirstProfileDraft;
    avatar: ProfileEditImageDraft;
    header: ProfileEditImageDraft;
  } | null;
  step: FirstProfileStep | 'complete';
  webHost: string;
};

export function FirstProfileOnboardingScreen(props: FirstProfileOnboardingScreenProps) {
  const {
    avatar,
    header,
    busy,
    created,
    draft,
    errors,
    onChange,
    onComplete,
    onNext,
    onSkip,
    result,
    startAction,
    step,
    webHost,
  } = props;
  const theme = useTheme();
  const safeArea = useSafeAreaPadding();
  const inputStep = step !== 'complete';
  const summaryDraft = props.summary?.draft ?? draft;
  const summaryAvatar = props.summary?.avatar ?? avatar;
  const summaryHeader = props.summary?.header ?? header;
  const title = inputStep ? copy[step].title : '첫 프로필이\n준비됐어요';
  const description = inputStep ? copy[step].description : undefined;
  const handleError =
    errors.handle ??
    (draft.handle.trim() && !localProfileHandleSchema.safeParse(draft.handle).success
      ? '핸들의 형식과 사용할 수 있는 단어를 확인해 주세요.'
      : undefined);
  const hasImageError = [avatar, header].some(
    (image) => image.kind === 'replacement' && image.uploadState === 'error',
  );
  const summary =
    props.summary === null ? (
      <Text
        accessibilityRole="alert"
        style={[textStyles.uiCopyM, { color: theme.foregroundSecondary }]}
      >
        프로필 요약을 불러오지 못했어요. 저장한 프로필로 시작할 수 있어요.
      </Text>
    ) : (
      <View style={[styles.summary, { borderColor: theme.borderDefault }]}>
        {summaryHeader.previewUri ? (
          <Image
            accessible={false}
            resizeMode="cover"
            source={{ uri: summaryHeader.previewUri }}
            style={styles.summaryHeader}
          />
        ) : null}
        <Avatar
          imageUri={summaryAvatar.previewUri}
          label={summaryDraft.displayName.trim() || summaryDraft.handle}
          size={64}
        />
        <Text style={[textStyles.uiHeadingS, { color: theme.foregroundPrimary }]}>
          {summaryDraft.displayName.trim() || summaryDraft.handle.trim()}
        </Text>
        <Text style={[textStyles.uiCopyM, { color: theme.foregroundSecondary }]}>
          @{summaryDraft.handle.trim()}
        </Text>
        {summaryDraft.bio.trim() ? (
          <Text style={[textStyles.contentM, { color: theme.foregroundPrimary }]}>
            {summaryDraft.bio.trim()}
          </Text>
        ) : null}
        <View style={styles.tags}>
          {summaryDraft.tags.map((name) => (
            <ProfileTagChip key={name} name={name} removable={false} />
          ))}
        </View>
        <Text style={[textStyles.uiCopyM, { color: theme.foregroundPrimary }]}>
          게시물 기본 공개 범위:{' '}
          {
            visibilityOptions.find((option) => option.value === summaryDraft.defaultPostVisibility)
              ?.label
          }
        </Text>
        <Text style={[textStyles.uiCopyM, { color: theme.foregroundPrimary }]}>
          팔로우 요청 자동 승인: {summaryDraft.followPolicy === 'OPEN' ? '켜짐' : '꺼짐'}
        </Text>
      </View>
    );
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.root, safeArea, { backgroundColor: theme.backgroundCanvas }]}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <FirstProfileOnboardingFrame
          title={title}
          description={description}
          headerAction={
            inputStep && step !== 'review' ? (
              <Button
                disabled={busy || !localProfileHandleSchema.safeParse(draft.handle).success}
                onPress={onComplete}
                size="compact"
                tone="secondary"
              >
                {step === 'handle' ? '바로 시작' : '나중에 설정'}
              </Button>
            ) : null
          }
          progress={
            inputStep ? (
              <View
                accessibilityLabel={`${firstProfileSteps.indexOf(step) + 1} / 5단계`}
                style={styles.progress}
              >
                {firstProfileSteps.map((item, index) => (
                  <View
                    key={item}
                    style={[
                      styles.progressPart,
                      {
                        backgroundColor:
                          index <= firstProfileSteps.indexOf(step)
                            ? theme.actionPrimaryBase
                            : theme.borderDefault,
                      },
                    ]}
                  />
                ))}
                <Text style={[textStyles.uiCopyS, { color: theme.foregroundSecondary }]}>
                  {firstProfileSteps.indexOf(step) + 1} / 5
                </Text>
              </View>
            ) : null
          }
          actions={
            <>
              {inputStep ? (
                <Button
                  disabled={busy || !localProfileHandleSchema.safeParse(draft.handle).success}
                  loading={busy}
                  onPress={step === 'review' ? onComplete : onNext}
                >
                  다음
                </Button>
              ) : (
                startAction
              )}
              {inputStep && step !== 'handle' && step !== 'review' ? (
                <Button disabled={busy} onPress={onSkip} tone="secondary">
                  지금은 건너뛰기
                </Button>
              ) : null}
            </>
          }
        >
          {step === 'handle' ? (
            <View style={styles.fields}>
              <Text style={[textStyles.uiLabelL, { color: theme.foregroundPrimary }]}>핸들</Text>
              <View style={styles.handleField}>
                <Text
                  accessible={false}
                  style={[textStyles.uiCopyL, { color: theme.foregroundSecondary }]}
                >
                  @
                </Text>
                <View style={styles.spacer}>
                  <TextField
                    accessibilityLabel="핸들"
                    accessibilityHint={
                      created ? '생성한 프로필의 핸들은 변경할 수 없어요.' : undefined
                    }
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!busy && !created}
                    error={handleError || undefined}
                    onChangeText={(handle) => onChange({ ...draft, handle })}
                    placeholder="예: bom"
                    value={draft.handle}
                  />
                </View>
              </View>
              <Text style={[textStyles.uiCopyM, { color: theme.foregroundSecondary }]}>
                내 프로필 주소: {webHost}/@{draft.handle.trim()}
              </Text>
            </View>
          ) : null}
          {step === 'details' ? (
            <View style={styles.fields}>
              <ProfileEditImageFields
                avatar={avatar}
                header={header}
                disabled={busy}
                onAvatarEdit={props.onAvatarEdit}
                onAvatarRemove={props.onAvatarRemove}
                onAvatarRetry={props.onAvatarRetry}
                onHeaderEdit={props.onHeaderEdit}
                onHeaderRemove={props.onHeaderRemove}
                onHeaderRetry={props.onHeaderRetry}
              />
              <TextField
                label="표시 이름"
                accessibilityHint="다른 사람들에게 보이는 닉네임이에요."
                editable={!busy}
                error={errors.displayName}
                onChangeText={(displayName) => onChange({ ...draft, displayName })}
                placeholder="사람들에게 보일 이름"
                value={draft.displayName}
              />
              <Text style={[textStyles.uiCopyM, { color: theme.foregroundSecondary }]}>
                다른 사람들에게 보이는 닉네임이에요.
              </Text>
              <Text style={[styles.counter, { color: theme.foregroundSecondary }]}>
                {[...draft.displayName.trim()].length}/40
              </Text>
              <TextArea
                label="소개"
                accessibilityHint="당신이 어떤 사람인지 알려주세요."
                editable={!busy}
                error={errors.bio}
                onChangeText={(bio) => onChange({ ...draft, bio })}
                placeholder="예: 책과 애니메이션 이야기를 좋아해요."
                value={draft.bio}
              />
              <Text style={[textStyles.uiCopyM, { color: theme.foregroundSecondary }]}>
                당신이 어떤 사람인지 알려주세요.
              </Text>
              <Text style={[styles.counter, { color: theme.foregroundSecondary }]}>
                {draft.bio.trim().length}/500
              </Text>
            </View>
          ) : null}
          {step === 'tags' ? (
            <View style={styles.fields}>
              <ProfileTagEditor
                addLabel="추가"
                description="태그를 달면 내 프로필에 표시돼요. 취향이 맞는 사람들과 교류할 기회를 늘려 보세요."
                disabled={busy}
                draftInput={{
                  value: draft.tagInput,
                  onChange: (tagInput) => onChange({ ...draft, tagInput }),
                  onAdd: (tag) => onChange({ ...draft, tags: [...draft.tags, tag], tagInput: '' }),
                }}
                onChange={(tags) => onChange({ ...draft, tags })}
                placeholder="예: 애니메이션"
                tags={draft.tags}
              />
              {errors.tags ? (
                <Text
                  accessibilityRole="alert"
                  style={[textStyles.uiCopyM, { color: theme.feedbackDangerOnSubtle }]}
                >
                  {errors.tags}
                </Text>
              ) : null}
            </View>
          ) : null}
          {step === 'posting' ? (
            <View style={styles.fields}>
              <Text style={[textStyles.uiLabelL, { color: theme.foregroundPrimary }]}>
                게시물 기본 공개 범위
              </Text>
              <Text style={[textStyles.uiCopyM, { color: theme.foregroundSecondary }]}>
                내 작성글이 노출되는 기본 범위를 정할 수 있어요. 게시글을 작성할 때 개별적으로
                변경할 수도 있어요.
              </Text>
              <RadioGroup
                accessibilityLabel="게시물 기본 공개 범위"
                disabled={busy}
                onChange={(defaultPostVisibility: FirstProfileDraft['defaultPostVisibility']) =>
                  onChange({ ...draft, defaultPostVisibility })
                }
                value={draft.defaultPostVisibility}
              >
                {visibilityOptions.map((option) => (
                  <RadioOption key={option.value} option={option} />
                ))}
              </RadioGroup>
              <View style={styles.switchRow}>
                <View style={styles.spacer}>
                  <Text style={[textStyles.uiLabelL, { color: theme.foregroundPrimary }]}>
                    팔로우 요청 자동 승인
                  </Text>
                  <Text style={[textStyles.uiCopyM, { color: theme.foregroundSecondary }]}>
                    설정을 끄면 팔로우 요청을 확인하고 원하는 사람만 수락할 수 있어요.
                  </Text>
                </View>
                <Switch
                  accessibilityLabel="팔로우 요청 자동 승인"
                  accessibilityHint="설정을 끄면 팔로우 요청을 확인하고 원하는 사람만 수락할 수 있어요."
                  disabled={busy}
                  onValueChange={(enabled) =>
                    onChange({ ...draft, followPolicy: enabled ? 'OPEN' : 'APPROVAL_REQUIRED' })
                  }
                  value={draft.followPolicy === 'OPEN'}
                />
              </View>
            </View>
          ) : null}
          {step === 'review' || step === 'complete' ? summary : null}
          {inputStep && result.kind === 'error' && !(step === 'details' && hasImageError) ? (
            <Text
              accessibilityRole="alert"
              style={[textStyles.uiCopyM, { color: theme.feedbackDangerOnSubtle }]}
            >
              {result.message}
            </Text>
          ) : null}
          {step === 'review' && Object.keys(errors).length ? (
            <View>
              {Object.values(errors).map((error) => (
                <Text
                  key={error}
                  accessibilityRole="alert"
                  style={[textStyles.uiCopyM, { color: theme.feedbackDangerOnSubtle }]}
                >
                  {error}
                </Text>
              ))}
            </View>
          ) : null}
        </FirstProfileOnboardingFrame>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scrollContent: { alignItems: 'center', flexGrow: 1 },
  progress: { alignItems: 'center', flexDirection: 'row', gap: space[8] },
  progressPart: { borderRadius: radius.full, flex: 1, height: space[4] },
  spacer: { flex: 1, minWidth: 0 },
  fields: { gap: space[12] },
  handleField: { alignItems: 'center', flexDirection: 'row', gap: space[8] },
  counter: { alignSelf: 'flex-end', ...textStyles.uiCopyS },
  switchRow: { alignItems: 'center', flexDirection: 'row', gap: space[16] },
  summary: { borderRadius: radius[16], borderWidth: 1, gap: space[12], padding: space[16] },
  summaryHeader: { aspectRatio: 3, borderRadius: radius[12], width: '100%' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: space[8] },
});
