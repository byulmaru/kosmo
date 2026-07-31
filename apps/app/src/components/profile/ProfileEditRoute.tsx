import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { graphql, useLazyLoadQuery, useMutation } from 'react-relay';
import { uploadComposerMedia } from '@/components/post/postComposerMedia';
import { StateView } from '@/components/ui/StateView';
import { useToast } from '@/components/ui/ToastProvider';
import { ProfileEditDiscardDialog } from './ProfileEditDiscardDialog';
import {
  completeProfileEditImageUpload,
  createProfileEditRouteImage,
  failProfileEditImageUpload,
  profileEditImageInput,
  releaseProfileEditImagePreview,
  removeProfileEditImage,
  replaceProfileEditImage,
  retryProfileEditImageUpload,
} from './profileEditMedia';
import { ProfileEditScreen } from './ProfileEditScreen';
import { isProfileEditDraftDirty } from './profileEditState';
import { useProfileEditNavigationGuard } from './useProfileEditNavigationGuard';
import type { Href } from 'expo-router';
import type { ProfileEditRouteCompleteMediaUploadMutation } from './__generated__/ProfileEditRouteCompleteMediaUploadMutation.graphql';
import type { ProfileEditRouteIssueMediaUploadUrlMutation } from './__generated__/ProfileEditRouteIssueMediaUploadUrlMutation.graphql';
import type { ProfileEditRouteQuery } from './__generated__/ProfileEditRouteQuery.graphql';
import type { ProfileEditRouteUpdateProfileMutation } from './__generated__/ProfileEditRouteUpdateProfileMutation.graphql';
import type { ProfileEditRouteImage } from './profileEditMedia';
import type { ProfileEditDraft, ProfileEditSubmitState } from './profileEditState';

type ImageField = 'avatar' | 'header';

function requireProfileFollowPolicy(value: string): ProfileEditDraft['followPolicy'] {
  if (value === 'OPEN' || value === 'APPROVAL_REQUIRED') {
    return value;
  }
  throw new Error('Unsupported Profile follow policy');
}

const query = graphql`
  query ProfileEditRouteQuery {
    currentSession {
      selectedProfile {
        relativeHandle
      }
    }
    selectedProfileForEdit {
      id
      relativeHandle
      displayName
      bio
      followPolicy
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
`;

const issueMediaUploadUrlMutation = graphql`
  mutation ProfileEditRouteIssueMediaUploadUrlMutation {
    issueMediaUploadUrl {
      media {
        id
      }
      uploadUrl
    }
  }
`;

const completeMediaUploadMutation = graphql`
  mutation ProfileEditRouteCompleteMediaUploadMutation($input: CompleteMediaUploadInput!) {
    completeMediaUpload(input: $input) {
      media {
        id
        state
      }
    }
  }
`;

const updateProfileMutation = graphql`
  mutation ProfileEditRouteUpdateProfileMutation($input: UpdateProfileInput!) {
    updateProfile(input: $input) {
      profile {
        id
        relativeHandle
        displayName
        bio
        followPolicy
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

export function ProfileEditRoute({ fetchKey }: { fetchKey: string }) {
  const router = useRouter();
  const data = useLazyLoadQuery<ProfileEditRouteQuery>(
    query,
    {},
    { fetchKey, fetchPolicy: 'network-only' },
  );
  const profile = data.selectedProfileForEdit;

  if (!profile) {
    const returnHandle = data.currentSession?.selectedProfile?.relativeHandle;
    return (
      <StateView
        actionLabel="프로필로 돌아가기"
        onAction={() => router.replace((returnHandle ? `/${returnHandle}` : '/') as Href)}
        title="이 프로필을 수정할 수 없어요"
      />
    );
  }

  return <EditableProfileRoute key={profile.id} profile={profile} />;
}

function EditableProfileRoute({
  profile,
}: {
  profile: NonNullable<ProfileEditRouteQuery['response']['selectedProfileForEdit']>;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const initialAvatar = createProfileEditRouteImage(profile.avatar);
  const initialHeader = createProfileEditRouteImage(profile.header);
  const initialValue: ProfileEditDraft = {
    avatar: initialAvatar.presentation,
    bio: profile.bio ?? '',
    displayName: profile.displayName,
    followPolicy: requireProfileFollowPolicy(profile.followPolicy),
    header: initialHeader.presentation,
    tags: [],
  };
  const [avatar, setAvatar] = useState(initialAvatar);
  const [header, setHeader] = useState(initialHeader);
  const avatarRef = useRef(avatar);
  const headerRef = useRef(header);
  const mounted = useRef(true);
  const selecting = useRef(false);
  const [cleanValue, setCleanValue] = useState(initialValue);
  const [value, setValue] = useState(initialValue);
  const [submitState, setSubmitState] = useState<ProfileEditSubmitState>({ kind: 'idle' });
  const [commitIssueMediaUploadUrl] = useMutation<ProfileEditRouteIssueMediaUploadUrlMutation>(
    issueMediaUploadUrlMutation,
  );
  const [commitCompleteMediaUpload] = useMutation<ProfileEditRouteCompleteMediaUploadMutation>(
    completeMediaUploadMutation,
  );
  const [commitUpdateProfile] =
    useMutation<ProfileEditRouteUpdateProfileMutation>(updateProfileMutation);
  const { allowNextNavigation, dialogProps } = useProfileEditNavigationGuard({
    dirty: isProfileEditDraftDirty(cleanValue, value),
    saving: submitState.kind === 'saving',
  });

  const updateImage = useCallback(
    (field: ImageField, update: (current: ProfileEditRouteImage) => ProfileEditRouteImage) => {
      const ref = field === 'avatar' ? avatarRef : headerRef;
      const next = update(ref.current);
      ref.current = next;
      if (field === 'avatar') {
        setAvatar(next);
      } else {
        setHeader(next);
      }
      setValue((current) => ({ ...current, [field]: next.presentation }));
      return next;
    },
    [],
  );

  const uploadImage = useCallback(
    async (field: ImageField, routeImage: ProfileEditRouteImage) => {
      const asset = routeImage.asset;
      if (!asset) {
        return;
      }
      const { generation } = routeImage;
      const fieldRef = field === 'avatar' ? avatarRef : headerRef;

      try {
        const mediaId = await uploadComposerMedia({
          complete: (id) =>
            new Promise<void>((resolve, reject) => {
              commitCompleteMediaUpload({
                variables: { input: { id } },
                onCompleted: (response, errors) => {
                  if (errors?.length || response.completeMediaUpload.media.state !== 'READY') {
                    reject(new Error('Profile image upload did not become Ready'));
                    return;
                  }
                  resolve();
                },
                onError: reject,
              });
            }),
          isActive: () =>
            mounted.current &&
            fieldRef.current.generation === generation &&
            fieldRef.current.asset === asset,
          issue: () =>
            new Promise((resolve, reject) => {
              commitIssueMediaUploadUrl({
                variables: {},
                onCompleted: (response, errors) => {
                  if (errors?.length) {
                    reject(new Error('Profile image upload could not start'));
                    return;
                  }
                  resolve({
                    mediaId: response.issueMediaUploadUrl.media.id,
                    uploadUrl: response.issueMediaUploadUrl.uploadUrl,
                  });
                },
                onError: reject,
              });
            }),
          put: async (uploadUrl) => {
            const body = asset.file ?? (await (await fetch(asset.uri)).blob());
            const response = await fetch(uploadUrl, {
              body,
              headers: asset.mimeType ? { 'content-type': asset.mimeType } : undefined,
              method: 'PUT',
            });
            if (!response.ok) {
              throw new Error('Profile image upload failed');
            }
          },
        });
        if (mediaId) {
          updateImage(field, (current) =>
            completeProfileEditImageUpload(current, generation, mediaId),
          );
        }
      } catch {
        if (mounted.current) {
          updateImage(field, (current) => failProfileEditImageUpload(current, generation));
        }
      }
    },
    [commitCompleteMediaUpload, commitIssueMediaUploadUrl, updateImage],
  );

  const selectImage = useCallback(
    async (field: ImageField) => {
      if (selecting.current) {
        return;
      }
      selecting.current = true;
      try {
        const result = await ImagePicker.launchImageLibraryAsync({
          allowsMultipleSelection: false,
          mediaTypes: ['images'],
        });
        if (!mounted.current || result.canceled || !result.assets[0]) {
          return;
        }

        const previous = field === 'avatar' ? avatarRef.current : headerRef.current;
        if (Platform.OS === 'web') {
          releaseProfileEditImagePreview(previous);
        }
        const next = updateImage(field, (current) =>
          replaceProfileEditImage(current, result.assets[0]!),
        );
        void uploadImage(field, next);
      } finally {
        selecting.current = false;
      }
    },
    [updateImage, uploadImage],
  );

  const removeImage = useCallback(
    (field: ImageField) => {
      const previous = field === 'avatar' ? avatarRef.current : headerRef.current;
      if (Platform.OS === 'web') {
        releaseProfileEditImagePreview(previous);
      }
      updateImage(field, removeProfileEditImage);
    },
    [updateImage],
  );

  const retryImage = useCallback(
    (field: ImageField) => {
      const next = updateImage(field, retryProfileEditImageUpload);
      void uploadImage(field, next);
    },
    [updateImage, uploadImage],
  );

  const handleSaveFailure = useCallback(() => {
    setSubmitState({ kind: 'idle' });
    showToast('프로필을 저장하지 못했어요.');
  }, [showToast]);

  const submit = useCallback(
    (draft: ProfileEditDraft) => {
      const avatarId = profileEditImageInput(avatarRef.current);
      const headerId = profileEditImageInput(headerRef.current);
      setSubmitState({ kind: 'saving' });
      commitUpdateProfile({
        variables: {
          input: {
            ...(avatarId === undefined ? {} : { avatarId }),
            bio: draft.bio.trim() || null,
            displayName: draft.displayName,
            followPolicy: draft.followPolicy,
            ...(headerId === undefined ? {} : { headerId }),
          },
        },
        onCompleted: (response, errors) => {
          if (errors?.length) {
            handleSaveFailure();
            return;
          }
          setCleanValue(draft);
          setSubmitState({ kind: 'idle' });
          allowNextNavigation(
            () => {
              try {
                router.replace(`/${response.updateProfile.profile.relativeHandle}` as Href);
              } catch {
                // Keep the saved draft recoverable when navigation cannot start.
              }
            },
            { keepAllowedUntilUnmount: true },
          );
        },
        onError: handleSaveFailure,
      });
    },
    [allowNextNavigation, commitUpdateProfile, handleSaveFailure, router],
  );

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (Platform.OS === 'web') {
        releaseProfileEditImagePreview(avatarRef.current);
        releaseProfileEditImagePreview(headerRef.current);
      }
    };
  }, []);

  return (
    <>
      <ProfileEditScreen
        initialValue={cleanValue}
        onAvatarEdit={() => selectImage('avatar')}
        onAvatarRemove={() => removeImage('avatar')}
        onAvatarRetry={() => retryImage('avatar')}
        onBack={() =>
          router.canGoBack() ? router.back() : router.replace(`/${profile.relativeHandle}` as Href)
        }
        onChange={setValue}
        onHeaderEdit={() => selectImage('header')}
        onHeaderRemove={() => removeImage('header')}
        onHeaderRetry={() => retryImage('header')}
        onSubmit={submit}
        showTags={false}
        submitState={submitState}
        value={{ ...value, avatar: avatar.presentation, header: header.presentation, tags: [] }}
      />
      <ProfileEditDiscardDialog {...dialogProps} />
    </>
  );
}
