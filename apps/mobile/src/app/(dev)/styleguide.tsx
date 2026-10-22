/**
 * Living style guide (dev builds only): every token and component, in either theme.
 * Check here after changing anything in packages/ui.
 */
import {
  Avatar,
  Badge,
  Button,
  Card,
  Chip,
  Divider,
  elevation,
  EmptyState,
  FriendRow,
  IconButton,
  Input,
  palette,
  radius,
  Rating,
  RestaurantCard,
  ReviewCard,
  Sheet,
  Skeleton,
  space,
  Text,
  TextArea,
  textVariants,
  ThemeProvider,
  useTheme,
  useToast,
  VisitListItem,
  type ColorRoles,
  type ColorScheme,
} from '@tablemates/ui';
import { useState, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

import { Section, useContentStyle } from '@/components/screen';

export default function StyleGuide() {
  const system = useTheme().scheme;
  const [scheme, setScheme] = useState<ColorScheme>(system);
  return (
    <ThemeProvider scheme={scheme}>
      <Guide scheme={scheme} onScheme={setScheme} />
    </ThemeProvider>
  );
}

function Guide({ scheme, onScheme }: { scheme: ColorScheme; onScheme: (s: ColorScheme) => void }) {
  const { colors } = useTheme();
  const content = useContentStyle({ header: true });
  const toast = useToast();
  const [sheet, setSheet] = useState(false);
  const [rating, setRating] = useState(4);
  const [filter, setFilter] = useState(true);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={[content, { gap: space[8] }]}>
      <View style={{ flexDirection: 'row', gap: space[2] }}>
        <Chip label="Light" icon="sunny-outline" selected={scheme === 'light'} onPress={() => onScheme('light')} />
        <Chip label="Dark" icon="moon-outline" selected={scheme === 'dark'} onPress={() => onScheme('dark')} />
      </View>

      <Section title="Color roles">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
          {(Object.keys(colors) as (keyof ColorRoles)[]).map((role) => (
            <Swatch key={role} color={colors[role]} label={role} />
          ))}
        </View>
      </Section>

      <Section title="Palette">
        {(['tomato', 'saffron', 'stone'] as const).map((scale) => (
          <View key={scale} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
            {Object.entries(palette[scale]).map(([step, hex]) => (
              <Swatch key={step} color={hex} label={`${scale} ${step}`} small />
            ))}
          </View>
        ))}
      </Section>

      <Section title="Typography">
        {(Object.keys(textVariants) as (keyof typeof textVariants)[]).map((v) => (
          <View key={v} style={{ gap: 2 }}>
            <Text variant="caption" tone="subtle">
              {v} · {textVariants[v].fontSize}/{textVariants[v].lineHeight}
            </Text>
            <Text variant={v}>Cacio e pepe at Luigi’s</Text>
          </View>
        ))}
      </Section>

      <Section title="Spacing · radius · elevation">
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space[2] }}>
          {Object.entries(space).map(([k, v]) => (
            <View key={k} style={{ alignItems: 'center', gap: 2 }}>
              <View style={{ width: v || 1, height: v || 1, backgroundColor: colors.primary }} />
              <Text variant="caption" tone="subtle">{k}</Text>
            </View>
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap: space[4], flexWrap: 'wrap' }}>
          {Object.entries(radius).map(([k, v]) => (
            <Demo key={k} label={`radius.${k}`}>
              <View style={{ width: 56, height: 56, borderRadius: v, backgroundColor: colors.primarySoft, borderWidth: 1, borderColor: colors.primary }} />
            </Demo>
          ))}
          {([1, 2, 3] as const).map((l) => (
            <Demo key={l} label={`elevation ${l}`}>
              <View style={{ width: 56, height: 56, borderRadius: radius.md, backgroundColor: colors.surface, boxShadow: elevation(l, colors.shadow) }} />
            </Demo>
          ))}
        </View>
      </Section>

      <Section title="Button">
        {(['primary', 'secondary', 'ghost', 'danger'] as const).map((variant) => (
          <View key={variant} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2], alignItems: 'center' }}>
            <Button title={variant} variant={variant} size="sm" />
            <Button title={variant} variant={variant} icon="add" />
            <Button title={variant} variant={variant} size="lg" />
            <Button title="Loading" variant={variant} loading />
            <Button title="Disabled" variant={variant} disabled />
          </View>
        ))}
        <View style={{ flexDirection: 'row', gap: space[2] }}>
          <IconButton icon="heart-outline" accessibilityLabel="Save" />
          <IconButton icon="share-outline" accessibilityLabel="Share" variant="secondary" />
          <IconButton icon="add" accessibilityLabel="Add" variant="primary" size="lg" />
        </View>
      </Section>

      <Section title="Input">
        <Input label="Default" placeholder="Type here" helperText="Helper text" />
        <Input label="With icon" icon="search" placeholder="Search restaurants" />
        <Input label="Error" value="not-an-email" error="Enter a valid email" />
        <Input label="Disabled" value="Can't touch this" editable={false} />
        <TextArea label="Text area" placeholder="Notes for your friends…" />
      </Section>

      <Section title="Avatar · chip · badge · rating">
        <View style={{ flexDirection: 'row', gap: space[3], alignItems: 'center' }}>
          <Avatar name="Maya Chen" size="sm" />
          <Avatar name="Jordan Lee" size="md" />
          <Avatar name="Sam Okafor" size="lg" ring />
          <Avatar name="Priya Patel" size="xl" />
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
          <Chip label="Italian" />
          <Chip label="Recommends" tone="primary" icon="thumbs-up" />
          <Chip label="Tiramisu" tone="accent" />
          <Chip label="Friends" tone="success" icon="checkmark" />
          <Chip label="Open now" selected={filter} onPress={() => setFilter(!filter)} />
        </View>
        <View style={{ flexDirection: 'row', gap: space[3], alignItems: 'center' }}>
          <Badge count={1} />
          <Badge count={7} />
          <Badge count={24} />
        </View>
        <Rating value={3.5} />
        <Rating value={rating} onChange={setRating} size="lg" />
      </Section>

      <Section title="Feedback">
        <View style={{ flexDirection: 'row', gap: space[2], flexWrap: 'wrap' }}>
          <Button title="Toast" variant="secondary" onPress={() => toast('Visit logged')} />
          <Button title="Success toast" variant="secondary" onPress={() => toast('Review shared', 'success')} />
          <Button title="Error toast" variant="secondary" onPress={() => toast("Couldn't save", 'danger')} />
          <Button title="Open sheet" variant="secondary" onPress={() => setSheet(true)} />
        </View>
        <Card style={{ gap: space[2] }}>
          <Skeleton width="50%" />
          <Skeleton />
          <Skeleton width="70%" />
        </Card>
        <Card>
          <EmptyState icon="people-outline" title="Your table is empty" message="Add friends to see their recommendations." action={{ label: 'Find friends', onPress: () => {} }} />
        </Card>
      </Section>

      <Section title="TableMates components">
        <RestaurantCard
          name="Luigi's Trattoria"
          address="123 Mulberry St, New York"
          cuisine={['Italian', 'Pizza']}
          priceLevel={2}
          friendStats={{ visits: 4, recommends: 3, averageRating: 4.5 }}
          onPress={() => {}}
        />
        <ReviewCard
          author={{ displayName: 'Maya Chen' }}
          restaurantName="Luigi's Trattoria"
          rating={5}
          recommends
          body="Best cacio e pepe in the city. Sit at the bar and ask for the off-menu negroni."
          dishes={['Cacio e pepe', 'Tiramisu']}
          visitedAt="2026-10-12"
          onPressAuthor={() => {}}
          onPressRestaurant={() => {}}
        />
        <Card padding={3}>
          <FriendRow user={{ displayName: 'Jordan Lee', username: 'jordan' }} status="none" onAdd={() => {}} />
          <Divider inset={12} />
          <FriendRow user={{ displayName: 'Sam Okafor', username: 'sam' }} status="incoming" onAccept={() => {}} onDecline={() => {}} />
          <Divider inset={12} />
          <FriendRow user={{ displayName: 'Priya Patel', username: 'priya' }} status="outgoing" onDecline={() => {}} />
          <Divider inset={12} />
          <FriendRow user={{ displayName: 'Alex Kim', username: 'alex' }} status="friends" />
        </Card>
        <Card padding={0} style={{ paddingVertical: 4 }}>
          <VisitListItem restaurantName="Luigi's Trattoria" visitedAt="2026-10-12" rating={5} recommends onPress={() => {}} />
          <Divider inset={3} />
          <VisitListItem restaurantName="Joe's Pizza" visitedAt="2026-10-02" onPress={() => {}} />
        </Card>
      </Section>

      <Sheet
        visible={sheet}
        onClose={() => setSheet(false)}
        title="Edit profile"
        footer={<Button title="Save" fullWidth onPress={() => setSheet(false)} />}>
        <Input label="Name" value="Maya Chen" />
        <TextArea label="Bio" value="Chasing the perfect bowl of ramen." />
      </Sheet>
    </ScrollView>
  );
}

function Swatch({ color, label, small }: { color: string; label: string; small?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={{ width: small ? 64 : 96, gap: 2 }}>
      <View style={{ height: small ? 32 : 40, borderRadius: radius.sm, backgroundColor: color, borderWidth: 1, borderColor: colors.border }} />
      <Text variant="caption" tone="muted" numberOfLines={1} style={{ fontSize: 11 }}>
        {label}
      </Text>
    </View>
  );
}

function Demo({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={{ alignItems: 'center', gap: space[1] }}>
      {children}
      <Text variant="caption" tone="subtle">{label}</Text>
    </View>
  );
}
