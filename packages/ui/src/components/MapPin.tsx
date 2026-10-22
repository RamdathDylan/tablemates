import { View } from 'react-native';

import { useTheme } from '../theme';
import { elevation, fontFamily, palette, radius, space } from '../tokens';
import { Icon } from './Icon';
import { Text } from './Text';

/** Who has been: you, your friends, or both. `saved` = on your list, nobody's been yet. */
export type MapPinKind = 'mine' | 'friends' | 'both' | 'saved';

export interface MapPinProps {
  kind: MapPinKind;
  /** Average stars in the current filter; shown inside the pin. */
  rating: number | null;
  /** Shows a thumbs-up when anyone in scope recommends it. */
  recommended?: boolean;
  /** On the viewer's want-to-try list. */
  saved?: boolean;
  /** The viewer is mayor here: a crown sits on the pin. */
  crowned?: boolean;
  /** A crawl stop number, shown in place of the rating. */
  stop?: number;
  selected?: boolean;
}

/**
 * Map marker: a pill with the average rating and a pointer underneath.
 * Tomato = you've been, saffron = friends only, tomato with a saffron ring = both.
 * The map supplies the accessible label (the restaurant summary); the pin is visual.
 */
export function MapPin({ kind, rating, recommended, saved, crowned, stop, selected }: MapPinProps) {
  const { colors } = useTheme();
  const fill = kind === 'friends' ? palette.saffron[400] : kind === 'saved' ? palette.stone[800] : colors.primary;
  const fg = kind === 'friends' ? palette.stone[900] : kind === 'saved' ? palette.stone[0] : colors.onPrimary;
  const ring = kind === 'both' ? palette.saffron[400] : colors.surface;

  return (
    <View aria-hidden style={{ alignItems: 'center', transform: [{ scale: selected ? 1.15 : 1 }] }}>
      {crowned && (
        // A small badge above the pill marks a place where the viewer is mayor.
        <View
          style={{
            width: 18,
            height: 18,
            marginBottom: -5,
            zIndex: 1,
            borderRadius: radius.full,
            backgroundColor: palette.saffron[400],
            borderWidth: 2,
            borderColor: colors.surface,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <Icon name="ribbon" size={10} color={palette.stone[900]} />
        </View>
      )}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 2,
          minWidth: 36,
          height: 28,
          paddingHorizontal: space[2],
          borderRadius: radius.full,
          backgroundColor: fill,
          borderWidth: kind === 'both' ? 3 : 2,
          borderColor: selected ? colors.text : ring,
          justifyContent: 'center',
          boxShadow: elevation(selected ? 3 : 2, colors.shadow),
        }}>
        {stop !== undefined ? (
          <Text style={{ color: fg, fontFamily: fontFamily.bodyBold, fontSize: 13, lineHeight: 16 }}>{stop}</Text>
        ) : rating !== null ? (
          <>
            <Icon name="star" size={11} color={fg} />
            <Text style={{ color: fg, fontFamily: fontFamily.bodyBold, fontSize: 12, lineHeight: 16 }}>
              {Number.isInteger(rating) ? rating : rating.toFixed(1)}
            </Text>
          </>
        ) : (
          <Icon name={kind === 'saved' ? 'bookmark' : 'restaurant'} size={13} color={fg} />
        )}
        {recommended && <Icon name="thumbs-up" size={11} color={fg} />}
        {saved && kind !== 'saved' && <Icon name="bookmark" size={11} color={fg} />}
      </View>
      {/* Pointer that marks the exact spot. */}
      <View
        style={{
          width: 10,
          height: 10,
          marginTop: -6,
          backgroundColor: fill,
          transform: [{ rotate: '45deg' }],
          borderRightWidth: 2,
          borderBottomWidth: 2,
          borderColor: selected ? colors.text : ring,
        }}
      />
    </View>
  );
}
