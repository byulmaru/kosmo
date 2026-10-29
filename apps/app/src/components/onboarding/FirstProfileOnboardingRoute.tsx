import { localProfileHandleSchema } from '@kosmo/core/validation';
import * as ImagePicker from 'expo-image-picker';
import { Redirect } from 'expo-router';
import { createContext, useContext, useEffect, useState } from 'react';
import { graphql, useFragment, useLazyLoadQuery, useMutation } from 'react-relay';
import { writeSelectedProfile } from '@/auth/selectedProfileStorage';
import {
  releaseImagePreview,
  reportImageUploadError,
  transferImage,
} from '@/components/media/imageUpload';
import {
  asImageUploadError,
  formatImageUploadFailureMessage,
} from '@/components/media/imageUploadErrors';
import {
  completeProfileEditImageUpload,
  createProfileEditRouteImage,
  failProfileEditImageUpload,
  profileEditImageInput,
  removeProfileEditImage,
  replaceProfileEditImage,
  retryProfileEditImageUpload,
} from '@/components/profile/profileEditMedia';
import { RouteBoundary, useRouteBoundary } from '@/components/RouteBoundary';
import { Splash } from '@/components/Splash';
import { StateView } from '@/components/ui/StateView';
import { useRelayActor, useRelayAuthLifecycleKey } from '@/relay/RelayActorProvider';
import { useSession } from '@/session/SessionProvider';
import { initialFirstProfileDraft, prepareFirstProfileStep } from './firstProfileOnboardingState';
import type { PropsWithChildren } from 'react';
import type { ImageUploadStage } from '@/components/media/imageUploadErrors';
import type { ProfileEditRouteImage } from '@/components/profile/profileEditMedia';
import type { FirstProfileOnboardingCompleteMediaMutation } from './__generated__/FirstProfileOnboardingCompleteMediaMutation.graphql';
import type { FirstProfileOnboardingCreateMutation } from './__generated__/FirstProfileOnboardingCreateMutation.graphql';
import type { FirstProfileOnboardingIssueMediaMutation } from './__generated__/FirstProfileOnboardingIssueMediaMutation.graphql';
import type { FirstProfileOnboardingProfile_profile$key } from './__generated__/FirstProfileOnboardingProfile_profile.graphql';
import type { FirstProfileOnboardingQuery } from './__generated__/FirstProfileOnboardingQuery.graphql';
import type { FirstProfileOnboardingSaveMutation } from './__generated__/FirstProfileOnboardingSaveMutation.graphql';
import type { FirstProfileOnboardingSelectMutation } from './__generated__/FirstProfileOnboardingSelectMutation.graphql';
import type { FirstProfileOnboardingScreenProps } from './FirstProfileOnboardingScreen';
import type {
  FirstProfileDraft,
  FirstProfileErrors,
  FirstProfileStep,
} from './firstProfileOnboardingState';

type ImageField = 'avatar' | 'header';
type Images = Record<ImageField, ProfileEditRouteImage>;
type Identity = { id: string; handle: string };
type Result = { kind: 'idle' } | { kind: 'success' } | { kind: 'error'; message: string };
type FlowValue = {
  busy: boolean;
  complete: (onComplete: () => void) => void;
  next: (step: Exclude<FirstProfileStep, 'review'>, onSaved: () => void) => void;
  skip: (onSkipped: () => void) => void;
  summary?: FirstProfileOnboardingScreenProps['summary'];
  createdProfile: Identity | null;
  profileSelected: boolean;
  draft: FirstProfileDraft;
  errors: FirstProfileErrors;
  images: Images;
  pickImage: (field: ImageField) => Promise<void>;
  removeImage: (field: ImageField) => void;
  retryImage: (field: ImageField) => void;
  result: Result;
  setDraft: (value: FirstProfileDraft) => void;
};
const FlowContext = createContext<FlowValue | null>(null);

const query = graphql`
  query FirstProfileOnboardingQuery @throwOnFieldError {
    currentSession {
      id
      selectedProfile {
        id
        instance {
          kind
        }
        viewerState {
          membership {
            role
          }
        }
        ...FirstProfileOnboardingProfile_profile
      }
    }
    me {
      id
      profiles {
        id
      }
    }
  }
`;
const createMutation = graphql`
  mutation FirstProfileOnboardingCreateMutation($handle: String!) {
    createProfile(input: { handle: $handle }) {
      profile {
        id
        handle
      }
    }
  }
`;
const selectMutation = graphql`
  mutation FirstProfileOnboardingSelectMutation($profileId: ID!) {
    selectProfile(input: { id: $profileId }) {
      profile {
        id
      }
    }
  }
`;
const profileFragment = graphql`
  fragment FirstProfileOnboardingProfile_profile on Profile @catch(to: NULL) {
    handle
    displayName
    bio
    followPolicy
    private {
      defaultPostVisibility
    }
    tags {
      name
    }
    avatar {
      url
    }
    header {
      url
    }
  }
`;
const saveMutation = graphql`
  mutation FirstProfileOnboardingSaveMutation($input: UpdateProfileInput!) {
    updateProfile(input: $input) {
      profile {
        id
        ...FirstProfileOnboardingProfile_profile
      }
    }
  }
`;
const issueMediaMutation = graphql`
  mutation FirstProfileOnboardingIssueMediaMutation($profileId: ID!) {
    issueMediaUploadUrl(input: { actorProfileId: $profileId }) {
      media {
        id
      }
      uploadUrl
    }
  }
`;
const completeMediaMutation = graphql`
  mutation FirstProfileOnboardingCompleteMediaMutation($mediaId: ID!) {
    completeMediaUpload(input: { id: $mediaId }) {
      media {
        id
        state
      }
    }
  }
`;

export function FirstProfileOnboardingRoute({ children }: PropsWithChildren) {
  const authLifecycleKey = useRelayAuthLifecycleKey();
  const { accountId, sessionId, status } = useSession();
  if (!accountId || !sessionId) {
    return status === 'error' ? <SessionConfirmationError /> : <Redirect href="/" />;
  }
  return (
    <FirstProfileFlow key={`${authLifecycleKey}:${accountId}:${sessionId}`}>
      <RouteBoundary
        loading={<Splash label="프로필을 확인하고 있어요." />}
        title="프로필을 불러오지 못했어요"
      >
        <FirstProfileQuery>{children}</FirstProfileQuery>
      </RouteBoundary>
    </FirstProfileFlow>
  );
}

function SessionConfirmationError() {
  const { resetSession } = useRelayActor();
  return (
    <StateView
      actionLabel="다시 시도"
      alert
      description="로그인 상태를 다시 확인한 뒤 계속할 수 있어요."
      onAction={resetSession}
      title="세션을 확인하지 못했어요"
    />
  );
}

function FirstProfileQuery({ children }: PropsWithChildren) {
  const { fetchKey } = useRouteBoundary();
  const data = useLazyLoadQuery<FirstProfileOnboardingQuery>(
    query,
    {},
    { fetchKey, fetchPolicy: 'network-only' },
  );
  const profile = useFragment<FirstProfileOnboardingProfile_profile$key>(
    profileFragment,
    data.currentSession?.selectedProfile,
  );
  const flow = useFirstProfileOnboarding();
  const { accountId, sessionId } = useSession();
  const { selectedProfileId } = useRelayActor();
  if (!data.me || !data.currentSession) {
    return <Redirect href="/" />;
  }
  if (data.me.id !== accountId || data.currentSession.id !== sessionId) {
    return <SessionConfirmationError />;
  }
  const selected = data.currentSession.selectedProfile;
  if (
    flow.createdProfile &&
    selectedProfileId &&
    (selectedProfileId !== flow.createdProfile.id ||
      selected?.id !== flow.createdProfile.id ||
      selected.instance.kind !== 'LOCAL' ||
      selected.viewerState?.membership?.role !== 'OWNER')
  ) {
    return (
      <StateView
        title="이 프로필의 온보딩을 계속할 수 없어요"
        description="선택한 프로필이나 수정 권한이 바뀌었어요."
      />
    );
  }
  if (!flow.createdProfile && data.me.profiles.length > 0) {
    return <Redirect href="/home" />;
  }
  const visibility = profile?.private?.defaultPostVisibility;
  const followPolicy = profile?.followPolicy;
  const summary =
    profile &&
    (visibility === 'PUBLIC' || visibility === 'UNLISTED' || visibility === 'FOLLOWERS') &&
    (followPolicy === 'OPEN' || followPolicy === 'APPROVAL_REQUIRED')
      ? {
          draft: {
            handle: profile.handle,
            displayName: profile.displayName,
            bio: profile.bio ?? '',
            tags: profile.tags.map((tag) => tag.name),
            tagInput: '',
            defaultPostVisibility: visibility,
            followPolicy,
          },
          avatar: { kind: 'current' as const, previewUri: profile.avatar?.url ?? null },
          header: { kind: 'current' as const, previewUri: profile.header?.url ?? null },
        }
      : null;
  return <FlowContext.Provider value={{ ...flow, summary }}>{children}</FlowContext.Provider>;
}

function FirstProfileFlow({ children }: PropsWithChildren) {
  const { resetCurrentActor, selectedProfileId } = useRelayActor();
  const [draft, setDraft] = useState(initialFirstProfileDraft);
  const [images, setImages] = useState<Images>(() => ({
    avatar: createProfileEditRouteImage(),
    header: createProfileEditRouteImage(),
  }));
  const [createdProfile, setCreatedProfile] = useState<Identity | null>(null);
  const [errors, setErrors] = useState<FirstProfileErrors>({});
  const [result, setResult] = useState<Result>({ kind: 'idle' });
  const [mediaBusy, setMediaBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [commitCreate, creating] =
    useMutation<FirstProfileOnboardingCreateMutation>(createMutation);
  const [commitSelect, selecting] =
    useMutation<FirstProfileOnboardingSelectMutation>(selectMutation);
  const [commitSave, saving] = useMutation<FirstProfileOnboardingSaveMutation>(saveMutation);
  const [commitIssue, issuing] =
    useMutation<FirstProfileOnboardingIssueMediaMutation>(issueMediaMutation);
  const [commitComplete, completing] =
    useMutation<FirstProfileOnboardingCompleteMediaMutation>(completeMediaMutation);
  const busy = creating || selecting || saving || issuing || completing || mediaBusy || picking;
  const avatarUri = images.avatar.asset?.uri;
  const headerUri = images.header.asset?.uri;
  // Picker-owned object URLs need release when their retained draft is replaced or the flow ends.
  useEffect(
    () => () => {
      if (avatarUri) {
        releaseImagePreview(avatarUri);
      }
    },
    [avatarUri],
  );
  useEffect(
    () => () => {
      if (headerUri) {
        releaseImagePreview(headerUri);
      }
    },
    [headerUri],
  );

  const fail = (message: string) => setResult({ kind: 'error', message });
  const uploadField = (
    identity: Identity,
    field: ImageField,
    image: ProfileEditRouteImage,
    onReady: (image: ProfileEditRouteImage) => void,
  ) => {
    const uploading = retryProfileEditImageUpload(image);
    const asset = uploading.asset;
    if (!asset) {
      return;
    }
    setImages((current) => ({ ...current, [field]: uploading }));
    const failed = (error: unknown, stage: ImageUploadStage) => {
      const uploadError = asImageUploadError(error, stage);
      reportImageUploadError(uploadError);
      setMediaBusy(false);
      setImages((current) => ({
        ...current,
        [field]: failProfileEditImageUpload(
          current[field],
          uploading.generation,
          uploadError.failure,
        ),
      }));
      fail(
        formatImageUploadFailureMessage(
          field === 'avatar' ? '아바타 이미지' : '헤더 이미지',
          uploadError.failure,
        ),
      );
    };
    commitIssue({
      variables: { profileId: identity.id },
      onCompleted: (response, responseErrors) => {
        const issued = response?.issueMediaUploadUrl;
        if (responseErrors?.length || !issued) {
          failed(new Error('Image issuance failed'), 'issue');
          return;
        }
        setMediaBusy(true);
        void transferImage(asset, issued.uploadUrl).then(
          () => {
            commitComplete({
              variables: { mediaId: issued.media.id },
              onCompleted: (completed, completeErrors) => {
                setMediaBusy(false);
                const media = completed?.completeMediaUpload?.media;
                if (
                  completeErrors?.length ||
                  media?.id !== issued.media.id ||
                  media.state !== 'READY'
                ) {
                  failed(new Error('Image completion failed'), 'complete');
                  return;
                }
                const ready = completeProfileEditImageUpload(
                  uploading,
                  uploading.generation,
                  media.id,
                );
                setImages((current) => ({ ...current, [field]: ready }));
                onReady(ready);
              },
              onError: (error) => failed(error, 'complete'),
            });
          },
          (error: unknown) => failed(error, 'transfer'),
        );
      },
      onError: (error) => failed(error, 'issue'),
    });
  };

  const saveStep = (
    step: 'details' | 'tags' | 'posting',
    onSaved: () => void,
    requestImages = images,
  ) => {
    if (!createdProfile || selectedProfileId !== createdProfile.id) {
      return;
    }
    const prepared = prepareFirstProfileStep(draft, step);
    if (!prepared.ok) {
      setErrors(prepared.errors);
      fail('입력한 내용을 확인해 주세요.');
      return;
    }
    if (step === 'details') {
      const field = (['avatar', 'header'] as const).find(
        (field) => requestImages[field].asset && !requestImages[field].mediaId,
      );
      if (field) {
        uploadField(createdProfile, field, requestImages[field], (ready) =>
          saveStep(step, onSaved, { ...requestImages, [field]: ready }),
        );
        return;
      }
    }
    const value = prepared.value;
    commitSave({
      variables: {
        input: {
          ...value,
          ...(value.tags ? { tags: [...value.tags] } : {}),
          ...(step === 'details'
            ? {
                avatarId: profileEditImageInput(requestImages.avatar),
                headerId: profileEditImageInput(requestImages.header),
              }
            : {}),
        },
      },
      onCompleted: (response) => {
        if (response?.updateProfile?.profile.id !== createdProfile.id) {
          fail('프로필을 저장하지 못했어요. 다시 시도하거나 지금은 건너뛸 수 있어요.');
          return;
        }
        const tags = value.tags;
        if (step === 'tags' && tags) {
          setDraft((current) => ({ ...current, tags, tagInput: '' }));
        }
        setResult({ kind: 'idle' });
        onSaved();
      },
      onError: () => fail('프로필을 저장하지 못했어요. 다시 시도하거나 지금은 건너뛸 수 있어요.'),
    });
  };

  const creationFailed = (cause: unknown) => {
    const record = (value: unknown): value is Record<string, unknown> =>
      typeof value === 'object' && value !== null;
    const source = record(cause) && record(cause.source) ? cause.source : null;
    const candidates: unknown[] = Array.isArray(cause)
      ? cause
      : Array.isArray(source?.errors)
        ? source.errors
        : [];
    const handleError = candidates.find(
      (error) => record(error) && record(error.extensions) && error.extensions.field === 'handle',
    );
    if (record(handleError) && record(handleError.extensions)) {
      setErrors({
        handle:
          handleError.extensions.code === 'CONFLICT'
            ? '이미 사용 중인 핸들이에요.'
            : '핸들을 확인해 주세요.',
      });
    }
    fail('프로필을 만들지 못했어요. 입력한 내용은 유지되니 다시 시도해 주세요.');
  };

  const createAndSelect = (onSelected: () => void) => {
    const handle = localProfileHandleSchema.safeParse(draft.handle);
    if (!handle.success) {
      setErrors({ handle: handle.error.issues[0]?.message ?? '핸들을 확인해 주세요.' });
      return;
    }
    const select = (identity: Identity) => {
      if (selectedProfileId === identity.id) {
        onSelected();
        return;
      }
      commitSelect({
        variables: { profileId: identity.id },
        onCompleted: (response, responseErrors) => {
          if (responseErrors?.length || response?.selectProfile?.profile.id !== identity.id) {
            fail('프로필을 선택하지 못했어요. 다시 시도해 주세요.');
            return;
          }
          if (resetCurrentActor(identity.id)) {
            void writeSelectedProfile(identity.id);
            onSelected();
          }
        },
        onError: () => fail('프로필을 선택하지 못했어요. 다시 시도해 주세요.'),
      });
    };
    if (createdProfile) {
      select(createdProfile);
      return;
    }
    commitCreate({
      variables: { handle: handle.data },
      onCompleted: (response, responseErrors) => {
        const identity = response?.createProfile?.profile;
        if (!identity) {
          creationFailed(responseErrors);
          return;
        }
        setCreatedProfile(identity);
        setDraft((current) => ({ ...current, handle: identity.handle }));
        select(identity);
      },
      onError: creationFailed,
    });
  };

  return (
    <FlowContext.Provider
      value={{
        busy,
        complete: (onComplete) => {
          if (busy) {
            return;
          }
          setErrors({});
          setResult({ kind: 'idle' });
          const finish = () => {
            setResult({ kind: 'success' });
            onComplete();
          };
          if (createdProfile && selectedProfileId === createdProfile.id) {
            finish();
          } else {
            createAndSelect(finish);
          }
        },
        next: (step, onSaved) => {
          if (busy) {
            return;
          }
          setErrors({});
          setResult({ kind: 'idle' });
          if (step === 'handle') {
            createAndSelect(onSaved);
          } else {
            saveStep(step, onSaved);
          }
        },
        skip: (onSkipped) => {
          if (!busy && createdProfile && selectedProfileId === createdProfile.id) {
            setErrors({});
            setResult({ kind: 'idle' });
            onSkipped();
          }
        },
        createdProfile,
        profileSelected: createdProfile !== null && selectedProfileId === createdProfile.id,
        draft,
        errors,
        images,
        result,
        setDraft: (value) => {
          if (!busy) {
            setDraft({ ...value, handle: createdProfile?.handle ?? value.handle });
            setErrors({});
            setResult({ kind: 'idle' });
          }
        },
        pickImage: async (field) => {
          if (busy) {
            return;
          }
          setPicking(true);
          try {
            const selection = await ImagePicker.launchImageLibraryAsync({
              allowsMultipleSelection: false,
              mediaTypes: ['images'],
            });
            const asset = !selection.canceled ? selection.assets[0] : undefined;
            if (asset) {
              setImages((current) => {
                const replacement = replaceProfileEditImage(current[field], asset);
                return {
                  ...current,
                  [field]: {
                    ...replacement,
                    presentation: {
                      kind: 'replacement',
                      previewUri: asset.uri,
                      uploadState: 'selected',
                    },
                  },
                };
              });
            }
          } catch {
            fail('이미지를 선택하지 못했어요. 다시 시도해 주세요.');
          } finally {
            setPicking(false);
          }
        },
        removeImage: (field) => {
          if (!busy) {
            setImages((current) => ({
              ...current,
              [field]: removeProfileEditImage(current[field]),
            }));
          }
        },
        retryImage: (field) => {
          if (!busy && createdProfile) {
            uploadField(createdProfile, field, images[field], () => setResult({ kind: 'idle' }));
          }
        },
      }}
    >
      {children}
    </FlowContext.Provider>
  );
}

export function useFirstProfileOnboarding(): FlowValue {
  const value = useContext(FlowContext);
  if (!value) {
    throw new Error('First-profile steps require their onboarding layout.');
  }
  return value;
}
