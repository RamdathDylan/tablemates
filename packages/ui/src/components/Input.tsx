import { forwardRef, useState, type ComponentRef } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { useTheme } from '../theme';
import { fontFamily, fontSize, radius, space } from '../tokens';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export interface InputProps extends TextInputProps {
  label: string;
  helperText?: string;
  /** Shown in place of helperText and turns the field red. */
  error?: string;
  icon?: IconName;
  /** Hides the visible label (it is still announced). Use for search fields. */
  hideLabel?: boolean;
}

export const Input = forwardRef<ComponentRef<typeof TextInput>, InputProps>(function Input(
  { label, helperText, error, icon, hideLabel, multiline, style, onFocus, onBlur, editable = true, ...rest },
  ref,
) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  // Focus is blue, not brand red, so it can't be mistaken for the error state.
  const borderColor = error ? colors.danger : focused ? colors.focusRing : colors.borderInput;
  const message = error ?? helperText;

  return (
    <View style={styles.wrapper}>
      {!hideLabel && <Text variant="label">{label}</Text>}
      <View
        style={[
          styles.field,
          {
            borderColor,
            borderWidth: focused || error ? 2 : 1,
            // Keep content from shifting when the border thickens.
            paddingHorizontal: focused || error ? space[3] - 1 : space[3],
            backgroundColor: editable ? colors.surface : colors.surfaceSunken,
            alignItems: multiline ? 'flex-start' : 'center',
          },
        ]}>
        {icon && <Icon name={icon} size={18} color="textSubtle" />}
        <TextInput
          ref={ref}
          accessibilityLabel={label}
          accessibilityHint={error}
          aria-invalid={!!error}
          editable={editable}
          multiline={multiline}
          placeholderTextColor={colors.textSubtle}
          selectionColor={colors.primary}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[
            styles.input,
            { color: colors.text },
            multiline && styles.multiline,
            // The wrapper draws the focus state; drop the browser's default outline.
            { outlineStyle: 'none' } as object,
            style,
          ]}
          {...rest}
        />
      </View>
      {message && (
        <Text variant="caption" tone={error ? 'danger' : 'muted'} role={error ? 'alert' : undefined}>
          {message}
        </Text>
      )}
    </View>
  );
});

export const TextArea = forwardRef<ComponentRef<typeof TextInput>, InputProps>(function TextArea(props, ref) {
  return <Input ref={ref} multiline textAlignVertical="top" {...props} />;
});

const styles = StyleSheet.create({
  wrapper: { gap: space[1] + 2 },
  field: {
    flexDirection: 'row',
    gap: space[2],
    minHeight: 44,
    borderRadius: radius.md,
  },
  input: {
    flex: 1,
    ...fontSize.md,
    fontFamily: fontFamily.body,
    paddingVertical: space[2] + 2,
  },
  multiline: { minHeight: 112 },
});
