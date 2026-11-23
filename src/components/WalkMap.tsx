import { useEffect, useMemo, useRef, useState } from 'react';
import {
  APILoadingStatus,
  APIProvider,
  AdvancedMarker,
  Map as GoogleMap,
  Pin,
  useApiLoadingStatus,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import { Crosshair, Layers, MapPin } from 'lucide-react';
import type { Coordinate } from '../types/walk';

type MapLayerId = 'terrain' | 'roadmap' | 'hybrid';

interface WalkMapProps {
  coordinates: Coordinate[];
  isRecording: boolean;
  quotaExceeded: boolean;
  walkLabel: string;
}

const DEFAULT_CENTER = { lat: 37.7694, lng: -122.4862 };

interface TrailLayerProps {
  coordinates: Coordinate[];
  isRecording: boolean;
  recenterSignal: number;
  mapTypeId: MapLayerId;
}

function TrailLayer({
  coordinates,
  isRecording,
  recenterSignal,
  mapTypeId,
}: TrailLayerProps) {
  const map = useMap();
  const mapsLib = useMapsLibrary('maps');
  const coreLib = useMapsLibrary('core');
  const polylineRef = useRef<google.maps.Polyline | null>(null);
  const hasCenteredRef = useRef(false);

  // Apply map layer type cleanly
  useEffect(() => {
    if (!map) return;
    map.setMapTypeId(mapTypeId);
  }, [map, mapTypeId]);

  // Draw and update geodesic polyline for the compressed coordinates
  useEffect(() => {
    if (!map || !mapsLib) return;

    if (!polylineRef.current) {
      polylineRef.current = new mapsLib.Polyline({
        map,
        geodesic: true,
        strokeColor: '#146C43',
        strokeOpacity: 0.95,
        strokeWeight: 5,
      });
    }

    const path = coordinates.map((c) => ({ lat: c.lat, lng: c.lng }));
    polylineRef.current.setPath(path);
    polylineRef.current.setMap(path.length >= 2 ? map : null);

    return () => {
      if (polylineRef.current) {
        polylineRef.current.setMap(null);
        polylineRef.current = null;
      }
    };
  }, [map, mapsLib, coordinates]);

  // Auto-pan during active recording or fit bounds for saved walk / recenter
  useEffect(() => {
    if (!map || !coreLib || coordinates.length === 0) return;

    if (isRecording) {
      const latest = coordinates[coordinates.length - 1];
      if (!hasCenteredRef.current || recenterSignal > 0) {
        map.panTo({ lat: latest.lat, lng: latest.lng });
        if (!hasCenteredRef.current) {
          map.setZoom(17);
          hasCenteredRef.current = true;
        }
      } else {
        map.panTo({ lat: latest.lat, lng: latest.lng });
      }
      return;
    }

    hasCenteredRef.current = false;

    if (coordinates.length === 1) {
      map.panTo({ lat: coordinates[0].lat, lng: coordinates[0].lng });
      map.setZoom(16);
      return;
    }

    const bounds = new coreLib.LatLngBounds();
    for (const c of coordinates) {
      bounds.extend({ lat: c.lat, lng: c.lng });
    }
    map.fitBounds(bounds, { top: 56, right: 48, bottom: 56, left: 48 });
  }, [map, coreLib, coordinates, isRecording, recenterSignal]);

  const startCoord = coordinates[0];
  const endCoord =
    coordinates.length > 1 ? coordinates[coordinates.length - 1] : null;

  return (
    <>
      {startCoord && (
        <AdvancedMarker
          position={{ lat: startCoord.lat, lng: startCoord.lng }}
          title="Start"
        >
          <Pin
            background="#146C43"
            borderColor="#0B472B"
            glyphColor="#FFFFFF"
            glyphText="S"
          />
        </AdvancedMarker>
      )}
      {endCoord && (
        <AdvancedMarker
          position={{ lat: endCoord.lat, lng: endCoord.lng }}
          title={isRecording ? 'Current position' : 'Finish'}
        >
          {isRecording ? (
            <div className="relative flex items-center justify-center">
              <span className="w-7 h-7 rounded-full bg-[#146C43]/25 animate-ping absolute" />
              <span className="w-4 h-4 rounded-full bg-[#146C43] border-[2.5px] border-white shadow-md relative" />
            </div>
          ) : (
            <Pin
              background="#C93B2B"
              borderColor="#8F2317"
              glyphColor="#FFFFFF"
              glyphText="F"
            />
          )}
        </AdvancedMarker>
      )}
    </>
  );
}

/**
 * Offline / fallback SVG topographic trail preview so the user can always
 * inspect their walk geometry even without network tiles on a remote hike.
 */
function OfflineTrailCanvas({
  coordinates,
  isRecording,
  reason,
}: {
  coordinates: Coordinate[];
  isRecording: boolean;
  reason?: string;
}) {
  const geometry = useMemo(() => {
    if (coordinates.length === 0) return null;

    const lats = coordinates.map((c) => c.lat);
    const lngs = coordinates.map((c) => c.lng);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);

    const pad = 44;
    const width = 640;
    const height = 400;
    const spanLat = Math.max(maxLat - minLat, 0.0004);
    const spanLng = Math.max(maxLng - minLng, 0.0004);

    const scale = Math.min(
      (width - pad * 2) / spanLng,
      (height - pad * 2) / spanLat
    );

    const offsetX = (width - spanLng * scale) / 2;
    const offsetY = (height - spanLat * scale) / 2;

    const pts = coordinates.map((c) => ({
      x: offsetX + (c.lng - minLng) * scale,
      y: height - (offsetY + (c.lat - minLat) * scale),
    }));

    return {
      width,
      height,
      pointsAttr: pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '),
      pts,
    };
  }, [coordinates]);

  return (
    <div className="relative w-full h-full bg-[#EEF1EC] flex flex-col items-center justify-center overflow-hidden">
      {/* Subtle topographic grid */}
      <svg
        className="w-full h-full"
        viewBox="0 0 640 400"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Walk trail path preview"
      >
        <defs>
          <pattern
            id="topo-grid"
            width="32"
            height="32"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 32 0 L 0 0 0 32"
              fill="none"
              stroke="#D8DFD5"
              strokeWidth="1"
            />
          </pattern>
        </defs>
        <rect width="640" height="400" fill="url(#topo-grid)" />

        {geometry ? (
          <>
            {geometry.pts.length >= 2 && (
              <polyline
                points={geometry.pointsAttr}
                fill="none"
                stroke="#146C43"
                strokeWidth="4.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}
            {geometry.pts.map((p, idx) => {
              const isStart = idx === 0;
              const isEnd = idx === geometry.pts.length - 1 && geometry.pts.length > 1;
              if (isStart) {
                return (
                  <g key={idx}>
                    <circle cx={p.x} cy={p.y} r="9" fill="#146C43" stroke="#FFFFFF" strokeWidth="2.5" />
                    <text
                      x={p.x}
                      y={p.y + 3.5}
                      textAnchor="middle"
                      fontSize="9"
                      fontWeight="700"
                      fill="#FFFFFF"
                    >
                      S
                    </text>
                  </g>
                );
              }
              if (isEnd) {
                return (
                  <g key={idx}>
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r="9"
                      fill={isRecording ? '#146C43' : '#C93B2B'}
                      stroke="#FFFFFF"
                      strokeWidth="2.5"
                    />
                    <text
                      x={p.x}
                      y={p.y + 3.5}
                      textAnchor="middle"
                      fontSize="9"
                      fontWeight="700"
                      fill="#FFFFFF"
                    >
                      {isRecording ? '●' : 'F'}
                    </text>
                  </g>
                );
              }
              return (
                <circle
                  key={idx}
                  cx={p.x}
                  cy={p.y}
                  r="3.2"
                  fill="#FFFFFF"
                  stroke="#146C43"
                  strokeWidth="2"
                />
              );
            })}
          </>
        ) : (
          <g transform="translate(320, 200)" textAnchor="middle">
            <text
              y="-6"
              fill="#47544D"
              fontSize="15"
              fontWeight="600"
              fontFamily="Outfit, sans-serif"
            >
              Ready to plot your route
            </text>
            <text y="18" fill="#68756E" fontSize="12.5" fontFamily="Plus Jakarta Sans, sans-serif">
              Press Start to begin capturing GPS coordinates every 2 seconds
            </text>
          </g>
        )}
      </svg>

      {reason && (
        <div className="absolute bottom-3 left-3 right-3 bg-white/90 backdrop-blur-sm border border-[#DDE1DC] rounded-xl px-3 py-2 text-xs text-[#47544D]">
          {reason}
        </div>
      )}
    </div>
  );
}

function MapsApiContent({
  coordinates,
  isRecording,
  mapTypeId,
  recenterSignal,
}: {
  coordinates: Coordinate[];
  isRecording: boolean;
  mapTypeId: MapLayerId;
  recenterSignal: number;
}) {
  const status = useApiLoadingStatus();

  if (
    status === APILoadingStatus.FAILED ||
    status === APILoadingStatus.AUTH_FAILURE
  ) {
    return (
      <OfflineTrailCanvas
        coordinates={coordinates}
        isRecording={isRecording}
        reason="Showing offline trail plotter. GPS capture and Google Maps export continue normally."
      />
    );
  }

  const initialCenter = coordinates[0]
    ? { lat: coordinates[0].lat, lng: coordinates[0].lng }
    : DEFAULT_CENTER;

  return (
    <GoogleMap
      defaultCenter={initialCenter}
      defaultZoom={coordinates.length > 0 ? 16 : 13}
      mapId="DEMO_MAP_ID"
      mapTypeId={mapTypeId}
      gestureHandling="greedy"
      disableDefaultUI
      zoomControl
      internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
      style={{ width: '100%', height: '100%' }}
    >
      <TrailLayer
        coordinates={coordinates}
        isRecording={isRecording}
        recenterSignal={recenterSignal}
        mapTypeId={mapTypeId}
      />
    </GoogleMap>
  );
}

export function WalkMap({
  coordinates,
  isRecording,
  quotaExceeded,
  walkLabel,
}: WalkMapProps) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
  const [mapTypeId, setMapTypeId] = useState<MapLayerId>('terrain');
  const [recenterSignal, setRecenterSignal] = useState(0);

  const hasValidKey = Boolean(apiKey && apiKey.trim().length > 0 && !quotaExceeded);
  const latest = coordinates[coordinates.length - 1];

  return (
    <div className="relative bg-white border border-[#DDE1DC] rounded-2xl overflow-hidden flex flex-col">
      {/* Compact Map Header Bar */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[#ECEEEB] bg-white">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#11181C] truncate">
            {walkLabel}
          </p>
          <p className="text-xs text-[#55605B] font-mono tabular-nums truncate">
            {latest
              ? `${latest.lat.toFixed(5)}, ${latest.lng.toFixed(5)} · ${coordinates.length} ${
                  coordinates.length === 1 ? 'coordinate' : 'coordinates'
                }`
              : 'Waiting for first GPS coordinate'}
          </p>
        </div>

        {/* Interactive Map Layer Switcher */}
        <div
          className="flex items-center gap-1 p-1 bg-[#F1F3F0] rounded-lg shrink-0"
          role="group"
          aria-label="Map layer"
        >
          {(
            [
              { id: 'terrain', label: 'Terrain' },
              { id: 'roadmap', label: 'Map' },
              { id: 'hybrid', label: 'Satellite' },
            ] as const
          ).map((layer) => (
            <button
              key={layer.id}
              type="button"
              onClick={() => setMapTypeId(layer.id)}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                mapTypeId === layer.id
                  ? 'bg-white text-[#11181C] shadow-xs'
                  : 'text-[#55605B] hover:text-[#11181C]'
              }`}
            >
              {layer.label}
            </button>
          ))}
        </div>
      </div>

      {/* Explicit-Height Map Canvas Container (prevents 0x0 collapse) */}
      <div className="relative w-full h-[320px] sm:h-[380px] lg:h-[560px]">
        {hasValidKey ? (
          <APIProvider apiKey={apiKey!} language="en" region="US">
            <MapsApiContent
              coordinates={coordinates}
              isRecording={isRecording}
              mapTypeId={mapTypeId}
              recenterSignal={recenterSignal}
            />
          </APIProvider>
        ) : (
          <OfflineTrailCanvas
            coordinates={coordinates}
            isRecording={isRecording}
            reason={
              quotaExceeded
                ? 'Interactive Google Map paused due to API quota. Offline trail view and coordinate exports remain active.'
                : undefined
            }
          />
        )}

        {/* Recenter Map Control */}
        {hasValidKey && coordinates.length > 0 && (
          <button
            type="button"
            onClick={() => setRecenterSignal((n) => n + 1)}
            aria-label="Recenter map on walk"
            title="Recenter on trail"
            className="absolute bottom-4 left-3 z-10 min-h-[44px] min-w-[44px] px-3 bg-white/95 hover:bg-white text-[#11181C] border border-[#DDE1DC] rounded-xl shadow-sm flex items-center justify-center gap-1.5 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap"
          >
            <Crosshair className="w-4 h-4 text-[#146C43]" />
            <span>Fit Trail</span>
          </button>
        )}

        {/* Empty Map Hint Overlay when live map is shown before first walk */}
        {hasValidKey && coordinates.length === 0 && !isRecording && (
          <div className="pointer-events-none absolute inset-x-4 bottom-4 flex justify-center">
            <div className="bg-white/95 backdrop-blur-sm border border-[#DDE1DC] rounded-xl px-3.5 py-2.5 shadow-sm flex items-center gap-2 text-xs text-[#37423C]">
              <MapPin className="w-4 h-4 text-[#146C43] shrink-0" />
              <span>Press Start to record your walk and plot your trail live on Google Maps.</span>
            </div>
          </div>
        )}

        {!hasValidKey && (
          <div className="pointer-events-none absolute top-3 right-3 bg-white/90 border border-[#DDE1DC] rounded-lg px-2.5 py-1 text-[11px] font-medium text-[#55605B] flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5" />
            <span>Offline Trail View</span>
          </div>
        )}
      </div>
    </div>
  );
}
