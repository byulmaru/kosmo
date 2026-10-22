import { localProfileHandleSchema } from '@kosmo/core/validation';
import * as ImagePicker from 'expo-image-picker';
import { Redirect } from 'expo-router';
import { createContext, useContext, useEffect, useState } from 'react';
import { graphql, useLazyLoadQuery, useMutation } from 'react-relay';
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
  removeProfileEditImage,
  replaceProfileEditImage,
  retryProfileEditImageUpload,
} from '@/components/profile/profileEditMedia';
import { RouteBoundary, useRouteBoundary } from '@/components/RouteBoundary';
import { Splash } from '@/components/Splash';
import { StateView } from '@/components/ui/StateView';
import { useRelayActor, useRelayAuthLifecycleKey } from '@/relay/RelayActorProvider';
import { useSession } from '@/session/SessionProvider';
import {
  defaultFirstProfileValues,
  firstProfileChanges,
  initialFirstProfileDraft,
  prepareFirstProfileDraft,
} from './firstProfileOnboardingState';
import type { PropsWithChildren } from 'react';
import type { ImageUploadStage } from '@/components/media/imageUploadErrors';
import type { ProfileEditRouteImage } from '@/components/profile/profileEditMedia';
import type { FirstProfileOnboardingCompleteMediaMutation } from './__generated__/FirstProfileOnboardingCompleteMediaMutation.graphql';
import type { FirstProfileOnboardingCreateMutation } from './__generated__/FirstProfileOnboardingCreateMutation.graphql';
import type { FirstProfileOnboardingIssueMediaMutation } from './__generated__/FirstProfileOnboardingIssueMediaMutation.graphql';
import type { FirstProfileOnboardingQuery } from './__generated__/FirstProfileOnboardingQuery.graphql';
import type { FirstProfileOnboardingSaveMutation } from './__generated__/FirstProfileOnboardingSaveMutation.graphql';
import type { FirstProfileOnboardingSelectMutation } from './__generated__/FirstProfileOnboardingSelectMutation.graphql';
import type {
  FirstProfileDraft,
  FirstProfileErrors,
  FirstProfileStep,
  FirstProfileValues,
} from './firstProfileOnboardingState';

type ImageField = 'avatar' | 'header';
type Images = Record<ImageField, ProfileEditRouteImage>;
type Identity = { id: string; handle: string; relativeHandle: string };
type Result = { kind: 'idle' } | { kind: 'success' } | { kind: 'error'; message: string };
type FlowValue = {
  busy: boolean;
  completedFrom: FirstProfileStep;
  complete: (
    step: FirstProfileStep,
    recovery?: { profile: Identity | null; refetch: () => void },
  ) => boolean;
  createdProfile: Identity | null;
  draft: FirstProfileDraft;
  errors: FirstProfileErrors;
  images: Images;
  pickImage: (field: ImageField) => Promise<void>;
  removeImage: (field: ImageField) => void;
  retryImage: (field: ImageField) => void;
  result: Result;
  setDraft: (value: FirstProfileDraft) => void;
  validateStep: (step: FirstProfileStep) => boolean;
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
      }
    }
    me {
      id
      profiles {
        id
        handle
        relativeHandle
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
        relativeHandle
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
// Serial mutation roots bind the actor before each profile-scoped action, including the first session actor.
const saveMutation = graphql`
  mutation FirstProfileOnboardingSaveMutation($profileId: ID!, $input: UpdateProfileInput!) {
    selectProfile(input: { id: $profileId }) {
      profile {
        id
      }
    }
    updateProfile(input: $input) {
      profile {
        id
        displayName
        bio
        followPolicy
        private {
          defaultPostVisibility
        }
        tags {
          id
          name
        }
        avatar {
          id
          url
        }
        header {
          id
          url
        }
      }
    }
  }
`;
const issueMediaMutation = graphql`
  mutation FirstProfileOnboardingIssueMediaMutation($profileId: ID!) {
    selectProfile(input: { id: $profileId }) {
      profile {
        id
      }
    }
    issueMediaUploadUrl(input: { actorProfileId: $profileId }) {
      media {
        id
      }
      uploadUrl
    }
  }
`;
const completeMediaMutation = graphql`
  mutation FirstProfileOnboardingCompleteMediaMutation($profileId: ID!, $mediaId: ID!) {
    selectProfile(input: { id: $profileId }) {
      profile {
        id
      }
    }
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
  const { fetchKey, refetch } = useRouteBoundary();
  const data = useLazyLoadQuery<FirstProfileOnboardingQuery>(
    query,
    {},
    { fetchKey, fetchPolicy: 'network-only' },
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
  const handle = localProfileHandleSchema.safeParse(flow.draft.handle);
  // A failed create response can hide a committed profile. The fresh account query owns recovery.
  const createdProfile =
    flow.createdProfile ??
    (handle.success
      ? (data.me.profiles.find((profile) => profile.handle === handle.data) ?? null)
      : null);
  const selected = data.currentSession.selectedProfile;
  if (
    createdProfile &&
    ((selectedProfileId && selectedProfileId !== createdProfile.id) ||
      (selected?.id === createdProfile.id &&
        (selected.instance.kind !== 'LOCAL' || selected.viewerState?.membership?.role !== 'OWNER')))
  ) {
    return (
      <StateView
        title="이 프로필의 온보딩을 계속할 수 없어요"
        description="선택한 프로필이나 수정 권한이 바뀌었어요."
      />
    );
  }
  if (!createdProfile && data.me.profiles.length > 0) {
    return <Redirect href="/home" />;
  }
  return (
    <FlowContext.Provider
      value={{
        ...flow,
        createdProfile,
        draft: createdProfile ? { ...flow.draft, handle: createdProfile.handle } : flow.draft,
        complete: (step) => flow.complete(step, { profile: createdProfile, refetch }),
        setDraft: (value) =>
          flow.setDraft({ ...value, handle: createdProfile?.handle ?? value.handle }),
      }}
    >
      {children}
    </FlowContext.Provider>
  );
}

function FirstProfileFlow({ children }: PropsWithChildren) {
  const { resetCurrentActor, selectedProfileId } = useRelayActor();
  const [draft, setDraft] = useState(initialFirstProfileDraft);
  const [images, setImages] = useState<Images>(() => ({
    avatar: createProfileEditRouteImage(),
    header: createProfileEditRouteImage(),
  }));
  const [createdProfile, setCreatedProfile] = useState<Identity | null>(null);
  const [savedValues, setSavedValues] = useState<FirstProfileValues | null>(null);
  const [needsSaveConfirmation, setNeedsSaveConfirmation] = useState(false);
  const [completedFrom, setCompletedFrom] = useState<FirstProfileStep>('handle');
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
  const finish = (identity: Identity, values: FirstProfileValues) => {
    if (selectedProfileId !== identity.id) {
      if (!resetCurrentActor(identity.id)) {
        return;
      }
      void writeSelectedProfile(identity.id);
    }
    setSavedValues(values);
    setNeedsSaveConfirmation(false);
    setDraft((current) => ({
      ...current,
      handle: identity.handle,
      displayName: current.displayName.trim() ? values.displayName : '',
      bio: values.bio ?? '',
      tags: values.tags,
      tagInput: '',
      defaultPostVisibility: values.defaultPostVisibility,
      followPolicy: values.followPolicy,
    }));
    setResult({ kind: 'success' });
  };

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
        if (
          responseErrors?.length ||
          response?.selectProfile?.profile.id !== identity.id ||
          !issued
        ) {
          failed(new Error('Image issuance failed'), 'issue');
          return;
        }
        setMediaBusy(true);
        void transferImage(asset, issued.uploadUrl).then(
          () => {
            commitComplete({
              variables: { profileId: identity.id, mediaId: issued.media.id },
              onCompleted: (completed, completeErrors) => {
                setMediaBusy(false);
                const media = completed?.completeMediaUpload?.media;
                if (
                  completeErrors?.length ||
                  completed?.selectProfile?.profile.id !== identity.id ||
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

  const persist = (
    identity: Identity,
    baseline: FirstProfileValues,
    value: FirstProfileValues,
    requestImages: Images,
  ) => {
    const field = (['avatar', 'header'] as const).find(
      (field) => requestImages[field].asset && !requestImages[field].mediaId,
    );
    if (field) {
      uploadField(identity, field, requestImages[field], (ready) =>
        persist(identity, baseline, value, { ...requestImages, [field]: ready }),
      );
      return;
    }
    const next = {
      ...value,
      avatarId: requestImages.avatar.mediaId,
      headerId: requestImages.header.mediaId,
    };
    const changes = needsSaveConfirmation ? next : firstProfileChanges(next, baseline);
    if (!changes) {
      commitSelect({
        variables: { profileId: identity.id },
        onCompleted: (response, responseErrors) => {
          if (responseErrors?.length || response?.selectProfile?.profile.id !== identity.id) {
            fail('프로필을 선택하지 못했어요. 다시 시도해 주세요.');
            return;
          }
          finish(identity, next);
        },
        onError: () => fail('프로필을 선택하지 못했어요. 다시 시도해 주세요.'),
      });
      return;
    }
    setNeedsSaveConfirmation(true);
    commitSave({
      variables: {
        profileId: identity.id,
        input: { ...changes, ...(changes.tags ? { tags: [...changes.tags] } : {}) },
      },
      onCompleted: (response, responseErrors) => {
        const saved = response?.updateProfile?.profile;
        const visibility = saved?.private?.defaultPostVisibility;
        if (
          !saved ||
          saved.id !== identity.id ||
          response?.selectProfile?.profile.id !== identity.id ||
          !['PUBLIC', 'UNLISTED', 'FOLLOWERS'].includes(visibility ?? '') ||
          !['OPEN', 'APPROVAL_REQUIRED'].includes(saved.followPolicy)
        ) {
          fail('프로필을 저장하지 못했어요. 입력한 내용은 유지되니 다시 시도해 주세요.');
          return;
        }
        if (responseErrors?.length) {
          fail('저장 결과를 확인하지 못했어요. 같은 프로필로 다시 시도해 주세요.');
          return;
        }
        setImages({
          avatar: createProfileEditRouteImage(saved.avatar),
          header: createProfileEditRouteImage(saved.header),
        });
        finish(identity, {
          ...next,
          displayName: saved.displayName,
          bio: saved.bio ?? null,
          tags: saved.tags.map((tag) => tag.name),
          followPolicy: saved.followPolicy as FirstProfileValues['followPolicy'],
          defaultPostVisibility: visibility as FirstProfileValues['defaultPostVisibility'],
          avatarId: saved.avatar?.id ?? null,
          headerId: saved.header?.id ?? null,
        });
      },
      onError: () => fail('프로필을 저장하지 못했어요. 입력한 내용은 유지되니 다시 시도해 주세요.'),
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

  const complete: FlowValue['complete'] = (step, recovery) => {
    if (busy) {
      return false;
    }
    const prepared = prepareFirstProfileDraft(draft);
    if (!prepared.ok) {
      setErrors(prepared.errors);
      fail('입력한 내용을 확인해 주세요.');
      return false;
    }
    setErrors({});
    setResult({ kind: 'idle' });
    setCompletedFrom(step);
    const { handle, ...values } = prepared.value;
    const value = { ...values, avatarId: images.avatar.mediaId, headerId: images.header.mediaId };
    const identity = createdProfile ?? recovery?.profile;
    if (identity) {
      const baseline = savedValues ?? defaultFirstProfileValues(identity.handle);
      setCreatedProfile(identity);
      setSavedValues(baseline);
      persist(identity, baseline, value, images);
      return true;
    }
    const failed = (cause: unknown) => {
      creationFailed(cause);
      recovery?.refetch();
    };
    commitCreate({
      variables: { handle },
      onCompleted: (response, responseErrors) => {
        const identity = response?.createProfile?.profile;
        if (!identity) {
          failed(responseErrors);
          return;
        }
        const baseline = defaultFirstProfileValues(identity.handle);
        setCreatedProfile(identity);
        setSavedValues(baseline);
        persist(identity, baseline, value, images);
      },
      onError: failed,
    });
    return true;
  };

  return (
    <FlowContext.Provider
      value={{
        busy,
        completedFrom,
        complete,
        createdProfile,
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
        validateStep: (step) => {
          const prepared = prepareFirstProfileDraft(draft);
          const fields =
            step === 'handle'
              ? ['handle']
              : step === 'details'
                ? ['displayName', 'bio']
                : step === 'tags'
                  ? ['tags']
                  : [];
          const relevant = prepared.ok
            ? {}
            : Object.fromEntries(
                Object.entries(prepared.errors).filter(([field]) => fields.includes(field)),
              );
          setErrors(relevant);
          return Object.keys(relevant).length === 0;
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
