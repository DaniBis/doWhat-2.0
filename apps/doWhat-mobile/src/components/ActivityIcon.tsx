import { Ionicons } from '@expo/vector-icons';
import { getActivityIconKey, type IconKey } from '@dowhat/shared/src/icons';

const ioMap: Record<IconKey, keyof typeof Ionicons.glyphMap> = {
  walk: 'walk-outline',
  bicycle: 'bicycle-outline',
  water: 'water-outline',
  body: 'body-outline',
  barbell: 'barbell-outline',
  football: 'football-outline',
  basketball: 'basketball-outline',
  tennisball: 'tennisball-outline',
  snow: 'snow-outline',
  flag: 'flag-outline',
  people: 'people-outline',
  leaf: 'leaf-outline',
  trail: 'footsteps-outline',
  location: 'location-outline',
  person: 'person-circle-outline',
  star: 'star-outline',
  trophy: 'trophy-outline',
};

export default function ActivityIcon({ name, size = 28, color = '#111827' }: { name?: string | null; size?: number; color?: string }) {
  const key = getActivityIconKey(name);
  const iconName = ioMap[key] || 'location-outline';
  return <Ionicons name={iconName as any} size={size} color={color} />;
}

