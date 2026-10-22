import { openStatus, type Restaurant } from '@tablemates/shared';
import { Button, Chip, space, Text } from '@tablemates/ui';
import { useState } from 'react';
import { Linking, View } from 'react-native';

import { openDirections } from '@/lib/maps-link';

/** "Open · closes 10 PM" as a chip; nothing when hours are unknown. */
export function OpenChip({ restaurant }: { restaurant: Restaurant }) {
  const status = openStatus(restaurant.hours, restaurant.utcOffsetMinutes);
  if (!status) return null;
  return <Chip label={status.label} icon={status.open ? 'time' : 'time-outline'} tone={status.open ? 'success' : 'neutral'} />;
}

/** Directions, call, website, and reserve: whatever Google knows about the place. */
export function EssentialActions({ restaurant: r }: { restaurant: Restaurant }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
      <Button title="Directions" icon="navigate" size="sm" variant="secondary" onPress={() => openDirections(r)} />
      {r.phone && (
        <Button
          title="Call"
          icon="call"
          size="sm"
          variant="secondary"
          accessibilityLabel={`Call ${r.name}, ${r.phone}`}
          onPress={() => Linking.openURL(`tel:${r.phone!.replace(/[^\d+]/g, '')}`)}
        />
      )}
      {r.website && <Button title="Website" icon="globe-outline" size="sm" variant="secondary" onPress={() => Linking.openURL(r.website!)} />}
      {/* Google Maps hosts reservations for places that take them. */}
      {r.mapsUrl && <Button title="Reserve" icon="calendar-outline" size="sm" variant="secondary" onPress={() => Linking.openURL(r.mapsUrl!)} />}
    </View>
  );
}

/** The week's hours, collapsed to one line until opened. */
export function HoursList({ restaurant }: { restaurant: Restaurant }) {
  const [open, setOpen] = useState(false);
  const lines = restaurant.hours?.weekdayDescriptions ?? [];
  if (!lines.length) return null;
  return (
    <View style={{ gap: space[1] }}>
      <Button
        title={open ? 'Hide hours' : 'See all hours'}
        icon={open ? 'chevron-up' : 'chevron-down'}
        size="sm"
        variant="ghost"
        aria-expanded={open}
        onPress={() => setOpen(!open)}
      />
      {open &&
        lines.map((line) => (
          <Text key={line} variant="caption" tone="muted">
            {line.replace(/ | /g, ' ')}
          </Text>
        ))}
    </View>
  );
}
