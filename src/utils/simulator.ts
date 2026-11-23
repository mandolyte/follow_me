import type { Coordinate } from '../types/walk';

/**
 * Generates realistic walking GPS coordinates every 2 seconds along a trail
 * featuring long straightaways and distinct turns, so users testing indoors
 * can verify the 2-second cadence, 3-point straight-line compression algorithm,
 * and 7-walk rolling buffer before heading outdoors with their Pixel phone.
 */
interface TrailLeg {
  bearingDeg: number;
  steps: number; // each step = 2 seconds (~3.0 meters at brisk walking pace)
}

const SAMPLE_ROUTES: TrailLeg[][] = [
  // Route A: Long straight promenade, sharp 90° bend, creek curve, return straight
  [
    { bearingDeg: 22, steps: 9 },
    { bearingDeg: 112, steps: 7 },
    { bearingDeg: 168, steps: 5 },
    { bearingDeg: 215, steps: 8 },
    { bearingDeg: 300, steps: 7 },
  ],
  // Route B: Switchback ridge hike
  [
    { bearingDeg: 45, steps: 7 },
    { bearingDeg: 315, steps: 6 },
    { bearingDeg: 48, steps: 7 },
    { bearingDeg: 140, steps: 6 },
    { bearingDeg: 225, steps: 8 },
  ],
];

export class SimulatedGpsWalker {
  private lat: number;
  private lng: number;
  private route: TrailLeg[];
  private legIndex = 0;
  private stepInLeg = 0;

  constructor(originLat = 37.7694, originLng = -122.4862, routeVariant = 0) {
    this.lat = originLat;
    this.lng = originLng;
    this.route = SAMPLE_ROUTES[routeVariant % SAMPLE_ROUTES.length];
  }

  public nextCoordinate(timestamp = Date.now()): Coordinate {
    const leg = this.route[this.legIndex];
    // Brisk walking speed ~1.45 m/s -> ~2.9m per 2-second sample
    const stepMeters = 2.9 + (Math.random() - 0.5) * 0.25;
    // Slight realistic GPS bearing wobble (±1.8 deg) on straight legs
    const bearingRad = ((leg.bearingDeg + (Math.random() - 0.5) * 3.2) * Math.PI) / 180;

    const dNorth = stepMeters * Math.cos(bearingRad);
    const dEast = stepMeters * Math.sin(bearingRad);

    const cosLat = Math.cos((this.lat * Math.PI) / 180);
    this.lat += dNorth / 111320;
    this.lng += dEast / (111320 * cosLat);

    this.stepInLeg += 1;
    if (this.stepInLeg >= leg.steps) {
      this.stepInLeg = 0;
      this.legIndex = (this.legIndex + 1) % this.route.length;
    }

    return {
      lat: this.lat,
      lng: this.lng,
      timestamp,
      accuracy: 4.2,
      altitude: 42,
    };
  }
}
