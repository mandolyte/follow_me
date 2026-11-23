import type {
  CompressionAction,
  Coordinate,
  DistanceUnit,
  WalkRecord,
  WalkStorageState,
} from '../types/walk';

export const MAX_SAVED_WALKS = 7;
export const CAPTURE_INTERVAL_MS = 2000;
const STORAGE_KEY = 'follow_me_rolling_walks_v1';
const EARTH_RADIUS_M = 6371000;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function toDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

/**
 * Great-circle distance between two coordinates in meters (Haversine formula).
 */
export function haversineDistanceMeters(a: Coordinate, b: Coordinate): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);

  const h =
    sinDLat * sinDLat +
    Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;

  return 2 * EARTH_RADIUS_M * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/**
 * Total path distance across an ordered list of coordinates in meters.
 */
export function calculatePathDistanceMeters(coords: Coordinate[]): number {
  if (coords.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    total += haversineDistanceMeters(coords[i - 1], coords[i]);
  }
  return total;
}

/**
 * Initial forward compass bearing from coordinate a to b in degrees [0, 360).
 */
export function initialBearingDegrees(a: Coordinate, b: Coordinate): number {
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLng = toRad(b.lng - a.lng);

  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);

  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/**
 * Smallest absolute angular difference between two headings in degrees [0, 180].
 */
export function angularDifferenceDegrees(b1: number, b2: number): number {
  const diff = Math.abs(b1 - b2) % 360;
  return diff > 180 ? 360 - diff : diff;
}

/**
 * Perpendicular distance in meters from `point` to line segment `segStart -> segEnd`
 * using a local equirectangular tangent-plane projection (accurate at walking scales).
 */
export function perpendicularDistanceMeters(
  point: Coordinate,
  segStart: Coordinate,
  segEnd: Coordinate
): number {
  const cosLat = Math.cos(toRad(segStart.lat));
  const metersPerDegLat = 111320;
  const metersPerDegLng = 111320 * cosLat;

  const px = (point.lng - segStart.lng) * metersPerDegLng;
  const py = (point.lat - segStart.lat) * metersPerDegLat;

  const ex = (segEnd.lng - segStart.lng) * metersPerDegLng;
  const ey = (segEnd.lat - segStart.lat) * metersPerDegLat;

  const segLenSq = ex * ex + ey * ey;
  if (segLenSq < 1e-6) {
    return Math.hypot(px, py);
  }

  const t = Math.max(0, Math.min(1, (px * ex + py * ey) / segLenSq));
  const projX = t * ex;
  const projY = t * ey;

  return Math.hypot(px - projX, py - projY);
}

/**
 * Determines whether three sequential coordinates (first -> second -> third)
 * lie in a generally straight forward line.
 */
export function isGenerallyStraightLine(
  first: Coordinate,
  second: Coordinate,
  third: Coordinate,
  angleToleranceDeg = 12,
  maxCrossTrackMeters = 3.0
): boolean {
  const d12 = haversineDistanceMeters(first, second);
  const d23 = haversineDistanceMeters(second, third);
  const d13 = haversineDistanceMeters(first, third);

  // If the walker is nearly stationary or took a sub-meter GPS jitter step,
  // avoid adding redundant points unless they visibly reversed direction.
  if (d12 < 0.75 || d23 < 0.75) {
    return d13 + 0.5 >= d12;
  }

  const bearing12 = initialBearingDegrees(first, second);
  const bearing23 = initialBearingDegrees(second, third);
  const turnAngle = angularDifferenceDegrees(bearing12, bearing23);

  // Never collapse a switchback or U-turn (> 90 deg change in heading).
  if (turnAngle > 90) {
    return false;
  }

  const crossTrack = perpendicularDistanceMeters(second, first, third);

  // Generally straight if heading change is within angle tolerance, OR if the
  // middle point deviates less than maxCrossTrackMeters off the direct line
  // while continuing forward (<= 35 deg).
  return (
    turnAngle <= angleToleranceDeg ||
    (crossTrack <= maxCrossTrackMeters && turnAngle <= 35)
  );
}

/**
 * Rolling 3-point straight-line coordinate compression algorithm:
 * - While fewer than 2 coordinates are recorded, simply add the coordinate.
 * - Once 2 coordinates have been recorded, each incoming 3rd coordinate will:
 *     1. Overwrite the 2nd coordinate if (first, second, incoming) form a
 *        generally straight line (keeping the window anchor at `first`).
 *     2. Add the incoming coordinate otherwise, restarting the compression
 *        counter with the coordinate prior to the latest one added (which
 *        naturally becomes `coords[n - 2]` and `coords[n - 1]`).
 */
export function appendCompressedCoordinate(
  existing: Coordinate[],
  incoming: Coordinate
): { coordinates: Coordinate[]; action: CompressionAction } {
  if (existing.length < 2) {
    return {
      coordinates: [...existing, incoming],
      action: 'added',
    };
  }

  const first = existing[existing.length - 2];
  const second = existing[existing.length - 1];

  if (isGenerallyStraightLine(first, second, incoming)) {
    const next = existing.slice(0, -1);
    next.push(incoming);
    return {
      coordinates: next,
      action: 'overwritten',
    };
  }

  return {
    coordinates: [...existing, incoming],
    action: 'added',
  };
}

/**
 * Load rolling 7-walk history from localStorage.
 */
export function loadWalkStorage(): WalkStorageState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { nextWalkNumber: 1, walks: [] };
    }
    const parsed = JSON.parse(raw) as Partial<WalkStorageState>;
    const walks = Array.isArray(parsed.walks)
      ? parsed.walks.slice(0, MAX_SAVED_WALKS)
      : [];
    const nextWalkNumber =
      typeof parsed.nextWalkNumber === 'number' && parsed.nextWalkNumber >= 1
        ? parsed.nextWalkNumber
        : walks.length + 1;

    return { nextWalkNumber, walks };
  } catch {
    return { nextWalkNumber: 1, walks: [] };
  }
}

/**
 * Save a completed walk into the 7-walk rolling ring buffer.
 * Walk #8 overwrites Walk #1 (Slot 1), Walk #9 overwrites Walk #2 (Slot 2), etc.
 */
export function saveWalkToRollingBuffer(
  currentState: WalkStorageState,
  draft: Omit<WalkRecord, 'id' | 'walkNumber' | 'slot'>
): {
  nextState: WalkStorageState;
  savedWalk: WalkRecord;
  overwroteWalkNumber?: number;
} {
  const walkNumber = currentState.nextWalkNumber;
  const slot = ((walkNumber - 1) % MAX_SAVED_WALKS) + 1;

  const existingInSlot = currentState.walks.find((w) => w.slot === slot);
  const overwroteWalkNumber = existingInSlot?.walkNumber;

  const savedWalk: WalkRecord = {
    ...draft,
    id: `walk-${walkNumber}-${draft.startedAt}`,
    walkNumber,
    slot,
  };

  const remaining = currentState.walks.filter((w) => w.slot !== slot);
  const walks = [savedWalk, ...remaining].slice(0, MAX_SAVED_WALKS);

  const nextState: WalkStorageState = {
    nextWalkNumber: walkNumber + 1,
    walks,
  };

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
  } catch {
    // Ignore storage quota errors in restricted browsing contexts.
  }

  return { nextState, savedWalk, overwroteWalkNumber };
}

export function deleteWalkFromStorage(
  currentState: WalkStorageState,
  walkId: string
): WalkStorageState {
  const nextState: WalkStorageState = {
    ...currentState,
    walks: currentState.walks.filter((w) => w.id !== walkId),
  };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
  } catch {
    // Ignore storage errors.
  }
  return nextState;
}

export function formatDistance(meters: number, unit: DistanceUnit): {
  value: string;
  label: string;
} {
  if (unit === 'mi') {
    const miles = meters / 1609.344;
    return {
      value: miles < 10 ? miles.toFixed(2) : miles.toFixed(1),
      label: 'mi',
    };
  }
  const km = meters / 1000;
  return {
    value: km < 10 ? km.toFixed(2) : km.toFixed(1),
    label: 'km',
  };
}

export function formatSpeed(mps: number, unit: DistanceUnit): {
  value: string;
  label: string;
} {
  const safeMps = Number.isFinite(mps) && mps > 0 ? mps : 0;
  if (unit === 'mi') {
    return {
      value: (safeMps * 2.236936).toFixed(2),
      label: 'mph',
    };
  }
  return {
    value: (safeMps * 3.6).toFixed(2),
    label: 'km/h',
  };
}

export function formatDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (n: number) => String(n).padStart(2, '0');
  if (hours > 0) {
    return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${pad(minutes)}:${pad(seconds)}`;
}

export function formatDurationReadable(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

export function formatWalkDate(timestamp: number): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(timestamp));
}

export function calculateCompressionPercent(
  rawCount: number,
  compressedCount: number
): number {
  if (rawCount <= 0 || compressedCount >= rawCount) return 0;
  return Math.round(((rawCount - compressedCount) / rawCount) * 100);
}
