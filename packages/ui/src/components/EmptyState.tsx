import { View } from 'react-native';

import { useTheme } from '../theme';
import { radius, space } from '../tokens';
import { Button } from './Button';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export interface EmptyStateProps {
  icon: IconName;
  title: string;
  message?: string;
  action?: { label: string; onPress: () => void };
}

export function EmptyState({ icon, title, message, action }: EmptyStateProps) {
  const { colors } = useTheme();
  return (
    <View style={{ alignItems: 'center', gap: space[3], paddingVertical: space[10], paddingHorizontal: space[6] }}>
      <View
        style={{
          width: 64,
          height: 64,
          borderRadius: radius.full,
          backgroundColor: colors.primarySoft,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <Icon name={icon} size={28} color="primary" />
      </View>
      <Text variant="heading" align="center">
        {title}
      </Text>
      {message && (
        <Text tone="muted" align="center" style={{ maxWidth: 320 }}>
          {message}
        </Text>
      )}
      {action && (
        <Button title={action.label} onPress={action.onPress} style={{ marginTop: space[2], alignSelf: 'center' }} />
      )}
    </View>
  );
}
