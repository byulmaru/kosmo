import { ChevronDown } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { AccessibilityInfo, Pressable, Text, View } from 'react-native';
import { postVisibilityPresentation } from '@/components/post/postVisibilityPresentation';
import { ModalSheet } from '@/components/ui/ModalSheet';
import { RadioGroup, RadioOption } from '@/components/ui/RadioGroup';
import { useTheme } from '@/theme/ThemeProvider';
import { borderWidths, iconSizes, radius, space, textStyles } from '@/theme/tokens';
import type { ProfilePostingSettingsValue } from './ProfilePostingSettings';

const options = ['PUBLIC', 'UNLISTED', 'FOLLOWERS'] as const;

export function ProfileVisibilitySelect({
  value,
  onChange,
}: {
  value: ProfilePostingSettingsValue['defaultPostVisibility'];
  onChange: (value: ProfilePostingSettingsValue['defaultPostVisibility']) => void;
}) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<View>(null);
  const summaryRef = useRef<View>(null);
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`게시물 기본 공개 범위: ${value === 'PUBLIC' ? '전체 공개' : postVisibilityPresentation[value].label}`}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(true)}
        ref={triggerRef}
        style={{
          alignItems: 'center',
          backgroundColor: theme.backgroundSurface,
          borderColor: theme.borderDefault,
          borderRadius: radius[12],
          borderWidth: borderWidths[1],
          flexDirection: 'row',
          justifyContent: 'space-between',
          minHeight: 48,
          padding: space[12],
          width: 160,
        }}
      >
        <Text style={[textStyles.uiCopyL, { color: theme.foregroundPrimary }]}>
          {value === 'PUBLIC' ? '전체 공개' : postVisibilityPresentation[value].label}
        </Text>
        <ChevronDown color={theme.foregroundPrimary} size={iconSizes[24]} />
      </Pressable>
      <ModalSheet
        title="게시물 기본 공개 범위"
        visible={open}
        dismissDisabled={!open}
        onClose={() => setOpen(false)}
        onShow={() => {
          if (summaryRef.current) {
            AccessibilityInfo.sendAccessibilityEvent(summaryRef.current, 'focus');
          }
        }}
        onDismiss={() => {
          if (triggerRef.current) {
            AccessibilityInfo.sendAccessibilityEvent(triggerRef.current, 'focus');
          }
        }}
      >
        <View accessible accessibilityRole="header" ref={summaryRef}>
          <Text style={[textStyles.uiCopyM, { color: theme.foregroundSecondary }]}>
            현재: {value === 'PUBLIC' ? '전체 공개' : postVisibilityPresentation[value].label}
          </Text>
        </View>
        <RadioGroup
          accessibilityLabel="게시물 기본 공개 범위"
          disabled={!open}
          value={value}
          onChange={(nextValue) => {
            if (open) {
              onChange(nextValue);
              setOpen(false);
            }
          }}
        >
          {options.map((option) => (
            <RadioOption
              key={option}
              option={{
                value: option,
                label: option === 'PUBLIC' ? '전체 공개' : postVisibilityPresentation[option].label,
              }}
            />
          ))}
        </RadioGroup>
      </ModalSheet>
    </>
  );
}
