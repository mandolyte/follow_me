import type { Coordinate, WalkRecord } from '../types/walk';
import { formatDurationReadable } from './geo';

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Generate a Google My Maps–compatible KML file with a styled LineString trail
 * plus Start and Finish placemarks.
 * Note: KML coordinate tuples strictly follow longitude,latitude,altitude order.
 */
export function buildGoogleMapsKml(
  coordinates: Coordinate[],
  title: string,
  description: string
): string {
  const coordLines = coordinates
    .map((c) => `${c.lng.toFixed(6)},${c.lat.toFixed(6)},${(c.altitude ?? 0).toFixed(1)}`)
    .join('\n          ');

  const start = coordinates[0];
  const end = coordinates[coordinates.length - 1];

  const startPlacemark = start
    ? `
    <Placemark>
      <name>Start</name>
      <Point>
        <coordinates>${start.lng.toFixed(6)},${start.lat.toFixed(6)},0</coordinates>
      </Point>
    </Placemark>`
    : '';

  const endPlacemark =
    end && coordinates.length > 1
      ? `
    <Placemark>
      <name>Finish</name>
      <Point>
        <coordinates>${end.lng.toFixed(6)},${end.lat.toFixed(6)},0</coordinates>
      </Point>
    </Placemark>`
      : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${escapeXml(title)}</name>
    <description>${escapeXml(description)}</description>
    <Style id="followMeTrail">
      <LineStyle>
        <color>ff436c14</color>
        <width>4</width>
      </LineStyle>
    </Style>
    <Placemark>
      <name>${escapeXml(title)} Path</name>
      <styleUrl>#followMeTrail</styleUrl>
      <LineString>
        <tessellate>1</tessellate>
        <coordinates>
          ${coordLines}
        </coordinates>
      </LineString>
    </Placemark>${startPlacemark}${endPlacemark}
  </Document>
</kml>
`;
}

/**
 * Generate a clean CSV with Latitude and Longitude columns suitable for
 * Google My Maps layer import, Google Earth, or spreadsheets.
 */
export function buildCoordinatesCsv(coordinates: Coordinate[]): string {
  const header = 'point,latitude,longitude,timestamp_iso';
  const rows = coordinates.map(
    (c, index) =>
      `${index + 1},${c.lat.toFixed(6)},${c.lng.toFixed(6)},${new Date(c.timestamp).toISOString()}`
  );
  return [header, ...rows].join('\n') + '\n';
}

/**
 * Generate a standard GPX 1.1 track file for outdoor GPS & map plotting tools.
 */
export function buildCoordinatesGpx(
  coordinates: Coordinate[],
  title: string
): string {
  const points = coordinates
    .map(
      (c) =>
        `      <trkpt lat="${c.lat.toFixed(6)}" lon="${c.lng.toFixed(6)}"><time>${new Date(c.timestamp).toISOString()}</time></trkpt>`
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Follow Me" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>${escapeXml(title)}</name>
    <trkseg>
${points}
    </trkseg>
  </trk>
</gpx>
`;
}

/**
 * Plain line-by-line latitude, longitude pairs for quick copy/paste into Google Maps.
 */
export function buildPlainCoordinateList(coordinates: Coordinate[]): string {
  return coordinates
    .map((c) => `${c.lat.toFixed(6)}, ${c.lng.toFixed(6)}`)
    .join('\n');
}

/**
 * Build a Google Maps walking directions URL sampled evenly up to 10 waypoints
 * (origin + up to 8 intermediate waypoints + destination) for quick opening in
 * the Google Maps mobile app.
 */
export function buildGoogleMapsRouteUrl(coordinates: Coordinate[]): string | null {
  if (coordinates.length === 0) return null;
  if (coordinates.length === 1) {
    const p = coordinates[0];
    return `https://www.google.com/maps/search/?api=1&query=${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
  }

  const origin = coordinates[0];
  const destination = coordinates[coordinates.length - 1];
  const interior = coordinates.slice(1, -1);

  const maxWaypoints = 8;
  let sampled: Coordinate[] = interior;
  if (interior.length > maxWaypoints) {
    sampled = [];
    for (let i = 0; i < maxWaypoints; i++) {
      const idx = Math.round(((i + 1) * (interior.length - 1)) / (maxWaypoints + 1));
      sampled.push(interior[idx]);
    }
  }

  const params = new URLSearchParams({
    api: '1',
    origin: `${origin.lat.toFixed(6)},${origin.lng.toFixed(6)}`,
    destination: `${destination.lat.toFixed(6)},${destination.lng.toFixed(6)}`,
    travelmode: 'walking',
  });

  if (sampled.length > 0) {
    params.set(
      'waypoints',
      sampled.map((p) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`).join('|')
    );
  }

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export function triggerFileDownload(
  content: string,
  filename: string,
  mimeType: string
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function buildWalkExportMeta(walk: WalkRecord | null, activeCoords: Coordinate[]): {
  title: string;
  slug: string;
  description: string;
  coordinates: Coordinate[];
} {
  if (walk) {
    const km = (walk.distanceMeters / 1000).toFixed(2);
    return {
      title: `Follow Me — Walk #${walk.walkNumber}`,
      slug: `follow-me-walk-${walk.walkNumber}`,
      description: `Distance: ${km} km | Time: ${formatDurationReadable(walk.durationMs)} | Coordinates: ${walk.coordinates.length} (compressed from ${walk.rawPointCount})`,
      coordinates: walk.coordinates,
    };
  }
  return {
    title: 'Follow Me — Current Walk',
    slug: 'follow-me-current-walk',
    description: `Coordinates: ${activeCoords.length}`,
    coordinates: activeCoords,
  };
}
