import { useState } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { Button } from '@/components/ui/Button';
import { useRelayActor } from '@/relay/RelayActorProvider';
import {
  otherPeopleProfiles,
  peopleProfiles,
  peopleQueryData,
  ReactionPeopleExample,
} from './ReactionPeople.fixtures';
import screenMeta from './ReactionPeople.stories';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactionPeopleScreenProps } from '@/components/reaction/ReactionPeopleScreen';

const meta = {
  ...screenMeta,
  parameters: { ...screenMeta.parameters, controls: { disable: true } },
  title: 'KOSMO/Screens/Reaction People/Tests',
} satisfies Meta<typeof screenMeta.component>;

export default meta;
type Story = StoryObj<typeof meta>;

export const HeaderFilterAndProfileRows: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getAllByRole('heading', { name: '반응한 사람' })).toHaveLength(1);
    expect(canvas.getByRole('tablist', { name: '반응 유형' })).toBeVisible();
    expect(canvas.getAllByRole('tab')).toHaveLength(6);
    expect(canvas.getByRole('tab', { name: /❤️/ })).toHaveAttribute('aria-selected', 'true');
    expect(await canvas.findByText('별빛 여행자')).toBeVisible();
    expect(canvas.queryByText('People에서는 숨기는 실제 소개입니다.')).not.toBeInTheDocument();
    expect(canvasElement.querySelector('a[href="/@people-starlight"]')).toBeInTheDocument();
    expect(canvas.getAllByRole('button', { name: '팔로우' })).toHaveLength(2);
    await userEvent.click(canvas.getByRole('button', { name: '뒤로 가기' }));
    expect(args.onBack).toHaveBeenCalledOnce();
  },
};

export const InitialFailureKeepsHeaderAndFilter: Story = {
  parameters: {
    relay: {
      operationResponses: {
        ReactionPeopleScreenQuery: {
          sequence: [{ error: 'People 최초 조회 실패' }, { data: peopleQueryData() }],
        },
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(await canvas.findByRole('alert')).toHaveTextContent('반응한 프로필을 불러오지 못했어요');
    expect(canvas.getByRole('heading', { name: '반응한 사람' })).toBeVisible();
    expect(canvas.getByRole('tablist', { name: '반응 유형' })).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: '다시 시도' }));
    expect(await canvas.findByText('별빛 여행자')).toBeVisible();
    expect(canvas.queryByRole('alert')).not.toBeInTheDocument();
  },
};

export const TypeChangeDoesNotReusePreviousRows: Story = {
  parameters: {
    relay: {
      operationResponses: {
        ReactionPeopleScreenQuery: {
          sequence: [
            { data: peopleQueryData() },
            { data: peopleQueryData(otherPeopleProfiles), delayMs: 400 },
          ],
        },
      },
    },
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    expect(await canvas.findByText('별빛 여행자')).toBeVisible();
    const partyTab = canvas.getByRole('tab', { name: /🎉/ });
    await userEvent.click(partyTab);
    expect(args.onTypeChange).toHaveBeenCalledWith('🎉');
    expect(partyTab).toHaveFocus();
    expect(partyTab).toHaveAttribute('aria-selected', 'true');
    expect(canvas.queryByText('별빛 여행자')).not.toBeInTheDocument();
    expect(await canvas.findByText('축하하는 혜성')).toBeVisible();
    expect(canvas.queryByText('별빛 여행자')).not.toBeInTheDocument();
    await waitFor(() =>
      expect(canvas.getByRole('status')).toHaveTextContent(
        '🎉 반응을 남긴 프로필 2명을 표시합니다.',
      ),
    );
    expect(canvas.getByRole('status')).toHaveAttribute('aria-live', 'polite');
  },
};

export const PaginationFailureKeepsRowsAndRetries: Story = {
  parameters: {
    relay: {
      operationResponses: {
        ReactionPeopleScreenQuery: { data: peopleQueryData(peopleProfiles, true) },
      },
      paginationResponses: [
        { error: 'People 추가 조회 실패' },
        { data: peopleQueryData(otherPeopleProfiles) },
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: '더 불러오기' }));
    expect(await canvas.findByRole('alert')).toHaveTextContent(
      '반응한 프로필을 더 불러오지 못했어요',
    );
    expect(canvas.getByText('별빛 여행자')).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: '다시 시도' }));
    expect(await canvas.findByText('축하하는 혜성')).toBeVisible();
    expect(canvas.getAllByText('별빛 여행자')).toHaveLength(1);
    expect(canvas.getAllByText('축하하는 혜성')).toHaveLength(1);
    expect(canvas.queryByRole('alert')).not.toBeInTheDocument();
  },
};

function RemountablePeople(props: ReactionPeopleScreenProps) {
  const [visible, setVisible] = useState(true);

  return (
    <>
      <Button onPress={() => setVisible((current) => !current)}>
        {visible ? '화면 숨기기' : '화면 다시 열기'}
      </Button>
      {visible ? <ReactionPeopleExample {...props} /> : null}
    </>
  );
}

export const RevisitShowsCacheBeforeRefresh: Story = {
  parameters: {
    relay: {
      operationResponses: {
        ReactionPeopleScreenQuery: {
          sequence: [
            { data: peopleQueryData() },
            { data: peopleQueryData(otherPeopleProfiles), delayMs: 600 },
          ],
        },
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(await canvas.findByText('별빛 여행자')).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: '화면 숨기기' }));
    await userEvent.click(canvas.getByRole('button', { name: '화면 다시 열기' }));
    expect(canvas.getByText('별빛 여행자')).toBeVisible();
    expect(await canvas.findByText('축하하는 혜성')).toBeVisible();
    expect(canvas.queryByText('별빛 여행자')).not.toBeInTheDocument();
  },
  render: (args) => <RemountablePeople {...args} />,
};

function ActorSwitchPeople(props: ReactionPeopleScreenProps) {
  const { resetActor } = useRelayActor();

  return (
    <>
      <Button onPress={() => resetActor('people-second-actor')}>활성 프로필 전환</Button>
      <ReactionPeopleExample {...props} />
    </>
  );
}

export const ActorSwitchDoesNotReusePreviousRows: Story = {
  parameters: {
    relay: {
      actorBoundary: true,
      operationResponses: {
        ReactionPeopleScreenQuery: [
          { data: peopleQueryData() },
          { data: peopleQueryData(otherPeopleProfiles), delayMs: 400 },
        ],
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(await canvas.findByText('별빛 여행자')).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: '활성 프로필 전환' }));
    await waitFor(() => expect(canvas.queryByText('별빛 여행자')).not.toBeInTheDocument());
    expect(await canvas.findByText('축하하는 혜성')).toBeVisible();
    expect(canvas.queryByText('별빛 여행자')).not.toBeInTheDocument();
  },
  render: (args) => <ActorSwitchPeople {...args} />,
};
