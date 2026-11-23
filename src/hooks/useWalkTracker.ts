import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  CompressionAction,
  Coordinate,
  WalkRecord,
  WalkStorageState,
} from '../types/walk';
import {
  CAPTURE_INTERVAL_MS,
  appendCompressedCoordinate,
  calculatePathDistanceMeters,
  deleteWalkFromStorage,
  loadWalkStorage,
  saveWalkToRollingBuffer,
} from '../utils/geo';
import { SimulatedGpsWalker } from '../utils/simulator';

export type GpsStatus = 'idle' | 'acquiring' | 'locked' | 'simulated' | 'error';

export interface ActiveWalkState {
  isRecording: boolean;
  startedAt: number | null;
  elapsedMs: number;
  coordinates: Coordinate[];
  rawPointCount: number;
  overwrittenCount: number;
  lastAction: CompressionAction | null;
  distanceMeters: number;
  averageSpeedMps: number;
  currentAccuracy: number | null;
  gpsStatus: GpsStatus;
  gpsError: string | null;
}

interface WakeLockSentinelLike {
  release: () => Promise<void>;
}

export function useWalkTracker() {
  const [storage, setStorage] = useState<WalkStorageState>(() => loadWalkStorage());
  const [selectedWalkId, setSelectedWalkId] = useState<string | null>(() => {
    const initial = loadWalkStorage();
    return initial.walks[0]?.id ?? null;
  });
  const [lastCompletedWalk, setLastCompletedWalk] = useState<WalkRecord | null>(null);
  const [overwroteNotice, setOverwroteNotice] = useState<string | null>(null);
  const [useSimulatedGps, setUseSimulatedGps] = useState(false);

  const [active, setActive] = useState<ActiveWalkState>({
    isRecording: false,
    startedAt: null,
    elapsedMs: 0,
    coordinates: [],
    rawPointCount: 0,
    overwrittenCount: 0,
    lastAction: null,
    distanceMeters: 0,
    averageSpeedMps: 0,
    currentAccuracy: null,
    gpsStatus: 'idle',
    gpsError: null,
  });

  // Mutable refs for clean interval/watch callbacks without stale closures
  const isRecordingRef = useRef(false);
  const startedAtRef = useRef<number | null>(null);
  const coordsRef = useRef<Coordinate[]>([]);
  const rawCountRef = useRef(0);
  const overwrittenCountRef = useRef(0);
  const latestFixRef = useRef<Coordinate | null>(null);
  const lastRecordedTimestampRef = useRef<number>(0);
  const pollInFlightRef = useRef(false);
  const simulatedModeRef = useRef(false);
  const simulatorRef = useRef<SimulatedGpsWalker | null>(null);

  const watchIdRef = useRef<number | null>(null);
  const captureIntervalRef = useRef<number | null>(null);
  const timerIntervalRef = useRef<number | null>(null);
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null);

  const releaseWakeLock = useCallback(async () => {
    if (wakeLockRef.current) {
      try {
        await wakeLockRef.current.release();
      } catch {
        // Ignore release errors when tab was backgrounded.
      }
      wakeLockRef.current = null;
    }
  }, []);

  const requestWakeLock = useCallback(async () => {
    try {
      const nav = navigator as Navigator & {
        wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> };
      };
      if (nav.wakeLock) {
        wakeLockRef.current = await nav.wakeLock.request('screen');
      }
    } catch {
      // Screen Wake Lock is optional; gracefully ignore if blocked.
    }
  }, []);

  const cleanupTimersAndWatchers = useCallback(() => {
    if (watchIdRef.current !== null && 'geolocation' in navigator) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (captureIntervalRef.current !== null) {
      window.clearInterval(captureIntervalRef.current);
      captureIntervalRef.current = null;
    }
    if (timerIntervalRef.current !== null) {
      window.clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    pollInFlightRef.current = false;
    void releaseWakeLock();
  }, [releaseWakeLock]);

  const ingestCoordinate = useCallback((coord: Coordinate, mode: 'gps' | 'simulated') => {
    if (!isRecordingRef.current) return;

    const { coordinates: nextCoords, action } = appendCompressedCoordinate(
      coordsRef.current,
      coord
    );

    coordsRef.current = nextCoords;
    rawCountRef.current += 1;
    if (action === 'overwritten') {
      overwrittenCountRef.current += 1;
    }
    lastRecordedTimestampRef.current = coord.timestamp;

    const distanceMeters = calculatePathDistanceMeters(nextCoords);
    const now = Date.now();
    const elapsedMs = startedAtRef.current ? Math.max(0, now - startedAtRef.current) : 0;
    const averageSpeedMps = elapsedMs > 0 ? distanceMeters / (elapsedMs / 1000) : 0;

    setActive((prev) => ({
      ...prev,
      coordinates: nextCoords,
      rawPointCount: rawCountRef.current,
      overwrittenCount: overwrittenCountRef.current,
      lastAction: action,
      distanceMeters,
      averageSpeedMps,
      elapsedMs,
      currentAccuracy: coord.accuracy ?? prev.currentAccuracy,
      gpsStatus: mode === 'simulated' ? 'simulated' : 'locked',
      gpsError: null,
    }));
  }, []);

  const positionToCoordinate = (pos: GeolocationPosition): Coordinate => ({
    lat: pos.coords.latitude,
    lng: pos.coords.longitude,
    timestamp: pos.timestamp || Date.now(),
    accuracy: pos.coords.accuracy,
    altitude: pos.coords.altitude,
  });

  const handleGeolocationError = useCallback((err: GeolocationPositionError) => {
    let message = 'Unable to read GPS signal.';
    if (err.code === err.PERMISSION_DENIED) {
      message =
        'Location permission denied. Allow GPS access in your browser settings, or enable Test GPS Mode to try a simulated walk.';
    } else if (err.code === err.POSITION_UNAVAILABLE) {
      message = 'GPS position is currently unavailable. Move outdoors for a clearer sky view.';
    } else if (err.code === err.TIMEOUT) {
      message = 'Waiting for GPS satellite lock...';
    }
    setActive((prev) => ({
      ...prev,
      gpsStatus: err.code === err.TIMEOUT && prev.coordinates.length > 0 ? 'locked' : 'error',
      gpsError: message,
    }));
  }, []);

  const startWalk = useCallback(() => {
    if (isRecordingRef.current) return;

    const now = Date.now();
    isRecordingRef.current = true;
    startedAtRef.current = now;
    coordsRef.current = [];
    rawCountRef.current = 0;
    overwrittenCountRef.current = 0;
    latestFixRef.current = null;
    lastRecordedTimestampRef.current = 0;
    simulatedModeRef.current = useSimulatedGps;

    setLastCompletedWalk(null);
    setOverwroteNotice(null);
    setSelectedWalkId(null);

    setActive({
      isRecording: true,
      startedAt: now,
      elapsedMs: 0,
      coordinates: [],
      rawPointCount: 0,
      overwrittenCount: 0,
      lastAction: null,
      distanceMeters: 0,
      averageSpeedMps: 0,
      currentAccuracy: null,
      gpsStatus: useSimulatedGps ? 'simulated' : 'acquiring',
      gpsError: null,
    });

    void requestWakeLock();

    // 1-second UI clock ticker for smooth elapsed time & live speed display
    timerIntervalRef.current = window.setInterval(() => {
      if (!isRecordingRef.current || !startedAtRef.current) return;
      const elapsedMs = Date.now() - startedAtRef.current;
      const dist = calculatePathDistanceMeters(coordsRef.current);
      setActive((prev) => ({
        ...prev,
        elapsedMs,
        averageSpeedMps: elapsedMs > 0 ? dist / (elapsedMs / 1000) : 0,
      }));
    }, 1000);

    if (useSimulatedGps) {
      const origin = storage.walks[0]?.coordinates[0];
      const walker = new SimulatedGpsWalker(
        origin?.lat ?? 37.7694,
        origin?.lng ?? -122.4862,
        storage.nextWalkNumber - 1
      );
      simulatorRef.current = walker;

      // Capture first coordinate immediately, then every 2 seconds
      ingestCoordinate(walker.nextCoordinate(now), 'simulated');
      captureIntervalRef.current = window.setInterval(() => {
        if (!isRecordingRef.current || !simulatorRef.current) return;
        ingestCoordinate(simulatorRef.current.nextCoordinate(Date.now()), 'simulated');
      }, CAPTURE_INTERVAL_MS);
      return;
    }

    if (!('geolocation' in navigator)) {
      setActive((prev) => ({
        ...prev,
        gpsStatus: 'error',
        gpsError: 'Geolocation is not supported on this device/browser.',
      }));
      return;
    }

    // Continuous high-accuracy watch feeds latestFixRef
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const coord = positionToCoordinate(pos);
        latestFixRef.current = coord;
        // Record the very first GPS fix immediately on Start
        if (rawCountRef.current === 0) {
          ingestCoordinate(coord, 'gps');
        } else {
          setActive((prev) => ({
            ...prev,
            currentAccuracy: coord.accuracy ?? prev.currentAccuracy,
            gpsStatus: 'locked',
            gpsError: null,
          }));
        }
      },
      handleGeolocationError,
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 10000,
      }
    );

    // Strict 2-second regular capture cadence
    captureIntervalRef.current = window.setInterval(() => {
      if (!isRecordingRef.current) return;

      const latest = latestFixRef.current;
      if (latest && latest.timestamp > lastRecordedTimestampRef.current) {
        ingestCoordinate(latest, 'gps');
        return;
      }

      // If watchPosition hasn't emitted a fresh timestamp yet, request a live fix
      if (!pollInFlightRef.current) {
        pollInFlightRef.current = true;
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            pollInFlightRef.current = false;
            const coord = positionToCoordinate(pos);
            latestFixRef.current = coord;
            ingestCoordinate(coord, 'gps');
          },
          (err) => {
            pollInFlightRef.current = false;
            // If we already have a recent fix, re-stamp at the 2-second mark
            // unless permission was explicitly denied.
            if (err.code === err.PERMISSION_DENIED) {
              handleGeolocationError(err);
            } else if (latestFixRef.current) {
              ingestCoordinate(
                { ...latestFixRef.current, timestamp: Date.now() },
                'gps'
              );
            } else {
              handleGeolocationError(err);
            }
          },
          {
            enableHighAccuracy: true,
            maximumAge: 1500,
            timeout: 4500,
          }
        );
      }
    }, CAPTURE_INTERVAL_MS);
  }, [
    handleGeolocationError,
    ingestCoordinate,
    requestWakeLock,
    storage.nextWalkNumber,
    storage.walks,
    useSimulatedGps,
  ]);

  const stopWalk = useCallback(() => {
    if (!isRecordingRef.current) return;

    const endedAt = Date.now();
    const startedAt = startedAtRef.current ?? endedAt;
    const durationMs = Math.max(1000, endedAt - startedAt);

    // Include any final unsampled GPS fix before stopping
    if (
      !simulatedModeRef.current &&
      latestFixRef.current &&
      latestFixRef.current.timestamp > lastRecordedTimestampRef.current
    ) {
      const { coordinates: finalCoords, action } = appendCompressedCoordinate(
        coordsRef.current,
        latestFixRef.current
      );
      coordsRef.current = finalCoords;
      rawCountRef.current += 1;
      if (action === 'overwritten') {
        overwrittenCountRef.current += 1;
      }
    }

    isRecordingRef.current = false;
    cleanupTimersAndWatchers();
    simulatorRef.current = null;

    const finalCoordinates = [...coordsRef.current];
    const distanceMeters = calculatePathDistanceMeters(finalCoordinates);
    const averageSpeedMps = durationMs > 0 ? distanceMeters / (durationMs / 1000) : 0;

    setActive((prev) => ({
      ...prev,
      isRecording: false,
      elapsedMs: durationMs,
      distanceMeters,
      averageSpeedMps,
      coordinates: finalCoordinates,
      gpsStatus: 'idle',
    }));

    if (finalCoordinates.length > 0) {
      const { nextState, savedWalk, overwroteWalkNumber } =
        saveWalkToRollingBuffer(storage, {
          startedAt,
          endedAt,
          durationMs,
          distanceMeters,
          averageSpeedMps,
          rawPointCount: rawCountRef.current,
          coordinates: finalCoordinates,
          isSimulated: simulatedModeRef.current,
        });

      setStorage(nextState);
      setLastCompletedWalk(savedWalk);
      setSelectedWalkId(savedWalk.id);

      if (overwroteWalkNumber !== undefined) {
        setOverwroteNotice(
          `Rolling 7-walk limit reached: Walk #${savedWalk.walkNumber} replaced Walk #${overwroteWalkNumber} in Slot ${savedWalk.slot}.`
        );
      }
    } else {
      setActive((prev) => ({
        ...prev,
        gpsError:
          prev.gpsError ??
          'No GPS coordinates were captured before stopping. Wait for a GPS fix before ending the walk.',
      }));
    }
  }, [cleanupTimersAndWatchers, storage]);

  const removeWalk = useCallback(
    (walkId: string) => {
      const next = deleteWalkFromStorage(storage, walkId);
      setStorage(next);
      if (selectedWalkId === walkId) {
        setSelectedWalkId(next.walks[0]?.id ?? null);
      }
      if (lastCompletedWalk?.id === walkId) {
        setLastCompletedWalk(null);
      }
    },
    [lastCompletedWalk?.id, selectedWalkId, storage]
  );

  useEffect(() => {
    return () => {
      cleanupTimersAndWatchers();
    };
  }, [cleanupTimersAndWatchers]);

  const selectedWalk =
    storage.walks.find((w) => w.id === selectedWalkId) ?? null;

  return {
    active,
    storage,
    selectedWalk,
    selectedWalkId,
    setSelectedWalkId,
    lastCompletedWalk,
    overwroteNotice,
    dismissOverwroteNotice: () => setOverwroteNotice(null),
    useSimulatedGps,
    setUseSimulatedGps,
    startWalk,
    stopWalk,
    removeWalk,
  };
}
