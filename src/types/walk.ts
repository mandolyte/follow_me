export interface Coordinate {
  lat: number;
  lng: number;
  timestamp: number;
  accuracy?: number;
  altitude?: number | null;
}

export type DistanceUnit = 'mi' | 'km';

export type CompressionAction = 'added' | 'overwritten';

export interface WalkRecord {
  id: string;
  walkNumber: number;
  slot: number; // 1..7 rolling slot
  startedAt: number;
  endedAt: number;
  durationMs: number;
  distanceMeters: number;
  averageSpeedMps: number;
  rawPointCount: number;
  coordinates: Coordinate[];
  isSimulated?: boolean;
}

export interface WalkStorageState {
  nextWalkNumber: number;
  walks: WalkRecord[];
}
