import { View } from 'react-native';

import { useTheme } from '../theme';
import { space, type Space } from '../tokens';

export function Divider({ inset = 0, spacing = 0 }: { inset?: Space; spacing?: Space }) {
  const { colors } = useTheme();
  return (
    <View
      aria-hidden
      style={{
        height: 1,
        backgroundColor: colors.border,
        marginLeft: space[inset],
        marginVertical: space[spacing],
      }}
    />
  );
}
