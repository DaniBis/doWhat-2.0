"use client";

import { getActivityIconKey, type IconKey } from '@dowhat/shared';
import {
  IoWalkOutline,
  IoBicycleOutline,
  IoWaterOutline,
  IoBodyOutline,
  IoBarbellOutline,
  IoFootballOutline,
  IoBasketballOutline,
  IoTennisballOutline,
  IoSnowOutline,
  IoFlagOutline,
  IoPeopleOutline,
  IoLeafOutline,
  IoFootstepsOutline,
  IoLocationOutline,
  IoPersonCircleOutline,
  IoStarOutline,
  IoTrophyOutline,
} from 'react-icons/io5';

const map: Record<IconKey, any> = {
  walk: IoWalkOutline,
  bicycle: IoBicycleOutline,
  water: IoWaterOutline,
  body: IoBodyOutline,
  barbell: IoBarbellOutline,
  football: IoFootballOutline,
  basketball: IoBasketballOutline,
  tennisball: IoTennisballOutline,
  snow: IoSnowOutline,
  flag: IoFlagOutline,
  people: IoPeopleOutline,
  leaf: IoLeafOutline,
  trail: IoFootstepsOutline,
  location: IoLocationOutline,
  person: IoPersonCircleOutline,
  star: IoStarOutline,
  trophy: IoTrophyOutline,
};

export default function WebActivityIcon({ name, size = 22, color = '#111827' }: { name?: string | null; size?: number; color?: string }) {
  const key = getActivityIconKey(name);
  const Cmp = map[key] || IoLocationOutline;
  return <Cmp size={size} color={color} />;
}

