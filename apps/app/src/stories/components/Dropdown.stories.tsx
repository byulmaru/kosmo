import { useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { ProfilePicker } from '@/components/profile/ProfilePicker';
import { Dropdown } from '@/components/ui/Dropdown';
import { spacing } from '@/theme/tokens';
import type { Meta, StoryObj } from '@storybook/react-vite';

const profiles = Array.from({ length: 16 }, (_, index) => ({
  displayName: `작성자 ${index + 1}`,
  id: `dropdown-profile-${index}`,
  relativeHandle: `@writer${index + 1}`,
}));

function DropdownFixture() {
  const triggerRef = useRef<View>(null);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(profiles[0]!.id);
  return (
    <View style={{ padding: spacing.lg }}>
      <Pressable
        accessibilityLabel="프로필 목록 열기"
        accessibilityRole="button"
        aria-expanded={open}
        onPress={() => setOpen(!open)}
        ref={triggerRef}
      >
        <Text>프로필 목록 열기</Text>
      </Pressable>
      <Text>{`선택: ${selected}`}</Text>
      <Dropdown
        accessibilityLabel="프로필 목록"
        maxHeight={240}
        minWidth={280}
        onRequestClose={() => setOpen(false)}
        open={open}
        testID="dropdown-long-list"
        triggerRef={triggerRef}
      >
        {(maxHeight) => (
          <ProfilePicker
            maxHeight={maxHeight}
            onSelect={(id) => {
              setSelected(id);
              setOpen(false);
            }}
            profiles={profiles}
            selectedProfileId={selected}
            surface="full"
          />
        )}
      </Dropdown>
    </View>
  );
}

const meta = {
  component: DropdownFixture,
  title: 'KOSMO/Components/Dropdown',
} satisfies Meta<typeof DropdownFixture>;
export default meta;
type Story = StoryObj<typeof meta>;

export const LongProfileList: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole('button', { name: '프로필 목록 열기' }));
    const menu = await page.findByTestId('dropdown-long-list');
    const list = within(menu).getByRole('group', { name: '전환할 프로필 목록' });
    expect(list.scrollHeight).toBeGreaterThan(list.clientHeight);
    list.scrollTop = list.scrollHeight;
    const last = within(menu).getByRole('button', { name: '작성자 16, @writer16' });
    await waitFor(() => {
      expect(last.getBoundingClientRect().bottom).toBeLessThanOrEqual(
        list.getBoundingClientRect().bottom + 1,
      );
    });
    await userEvent.click(last);
    expect(canvas.getByText('선택: dropdown-profile-15')).toBeVisible();
    expect(page.queryByTestId('dropdown-long-list')).not.toBeInTheDocument();
  },
};
