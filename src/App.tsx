import { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  Navigation,
  Play,
  Square,
  Trash2,
} from 'lucide-react';
import { CoordinateTable } from './components/CoordinateTable';
import { ExportSheet } from './components/ExportSheet';
import { OfflineIndicator } from './components/OfflineIndicator';
import { PWAInstallButton } from './components/PWAInstallButton';
import { useWalkTracker } from './hooks/useWalkTracker';
import type { DistanceUnit } from './types/walk';
import {
  MAX_SAVED_WALKS,
  calculateCompressionPercent,
  formatDistance,
  formatDuration,
  formatDurationReadable,
  formatSpeed,
  formatWalkDate,
} from './utils/geo';

export default function App() {
  const {
    active,
    storage,
    selectedWalk,
    selectedWalkId,
    setSelectedWalkId,
    lastCompletedWalk,
    overwroteNotice,
    dismissOverwroteNotice,
    useSimulatedGps,
    setUseSimulatedGps,
    startWalk,
    stopWalk,
    removeWalk,
  } = useWalkTracker();

  const [unit, setUnit] = useState<DistanceUnit>('mi');
  const [exportOpen, setExportOpen] = useState(false);

  // Determine which walk's data is displayed in telemetry and the coordinate table
  const isViewingLive = active.isRecording;
  const displayedWalk = isViewingLive ? null : selectedWalk;
  const displayedCoordinates = isViewingLive
    ? active.coordinates
    : displayedWalk?.coordinates ?? active.coordinates;
  const displayedRawCount = isViewingLive
    ? active.rawPointCount
    : displayedWalk?.rawPointCount ?? active.rawPointCount;

  const displayedDistanceMeters = isViewingLive
    ? active.distanceMeters
    : displayedWalk?.distanceMeters ?? 0;
  const displayedDurationMs = isViewingLive
    ? active.elapsedMs
    : displayedWalk?.durationMs ?? 0;
  const displayedSpeedMps = isViewingLive
    ? active.averageSpeedMps
    : displayedWalk?.averageSpeedMps ?? 0;

  const distFmt = formatDistance(displayedDistanceMeters, unit);
  const speedFmt = formatSpeed(displayedSpeedMps, unit);
  const compressionPct = calculateCompressionPercent(
    displayedRawCount,
    displayedCoordinates.length
  );

  const canExport = displayedCoordinates.length > 0;
  const latestCoordinate = displayedCoordinates[displayedCoordinates.length - 1] ?? null;

  const walkLabel = isViewingLive
    ? useSimulatedGps
      ? 'Live Walk (Test GPS)'
      : 'Live Walk'
    : displayedWalk
      ? `Walk #${displayedWalk.walkNumber} · Slot ${displayedWalk.slot} of ${MAX_SAVED_WALKS}`
      : 'No walk selected';

  const statusText = active.isRecording
    ? active.gpsStatus === 'acquiring'
      ? 'Acquiring GPS fix'
      : active.gpsStatus === 'simulated'
        ? 'Recording test GPS every 2s'
        : active.currentAccuracy !== null
          ? `Recording every 2s · ±${Math.round(active.currentAccuracy)}m accuracy`
          : 'Recording GPS every 2s'
    : 'Ready to track';

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F7F5] text-[#11181C] flex flex-col">
      <OfflineIndicator />

      {/* 3-Zone Top Navigation Bar (non-sticky on mobile to respect 15% sticky cap) */}
      <header className="bg-white border-b border-[#DDE1DC]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
          <a
            href="#tracker"
            className="font-display text-xl font-bold tracking-tight text-[#11181C] whitespace-nowrap shrink-0"
          >
            Follow Me
          </a>

          <nav
            aria-label="Primary sections"
            className="hidden md:flex items-center gap-6 text-sm font-medium text-[#55605B]"
          >
            <button
              type="button"
              onClick={() => scrollToSection('tracker')}
              className="hover:text-[#11181C] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Tracker
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('saved-walks')}
              className="hover:text-[#11181C] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Saved Walks
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('coordinates')}
              className="hover:text-[#11181C] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Coordinates
            </button>
          </nav>

          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={() => setExportOpen(true)}
              disabled={!canExport}
              className="min-h-[42px] px-4 py-2 rounded-xl bg-[#11181C] hover:bg-[#232F36] disabled:bg-[#D5DAD4] disabled:text-[#747F7A] text-white text-xs sm:text-sm font-medium flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:cursor-not-allowed"
            >
              <Download className="w-4 h-4 shrink-0" />
              <span>Export Coordinates</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main
        id="tracker"
        className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-5 pb-28 lg:pb-12 space-y-5"
      >
        {/* Workspace Toolbar: Status, Units, and Optional Indoor Test Mode */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs sm:text-sm text-[#55605B] min-w-0">
            <Navigation
              className={`w-4 h-4 shrink-0 ${
                active.isRecording ? 'text-[#C93B2B]' : 'text-[#146C43]'
              }`}
            />
            <span
              className={`font-medium truncate ${
                active.isRecording ? 'text-[#11181C]' : 'text-[#55605B]'
              }`}
            >
              {statusText}
            </span>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <PWAInstallButton />

            {/* Opt-in Test GPS Mode for indoor verification */}
            <label className="inline-flex items-center gap-2 text-xs font-medium text-[#55605B] cursor-pointer select-none min-h-[40px]">
              <input
                type="checkbox"
                checked={useSimulatedGps}
                disabled={active.isRecording}
                onChange={(e) => setUseSimulatedGps(e.target.checked)}
                className="w-4 h-4 rounded border-[#C8CFC7] accent-[#146C43] cursor-pointer disabled:opacity-50"
              />
              <span className="whitespace-nowrap">Test GPS mode</span>
            </label>

            {/* Distance & Speed Unit Switcher */}
            <div
              className="flex items-center gap-1 p-1 bg-[#ECEEEB] rounded-lg"
              role="group"
              aria-label="Distance units"
            >
              <button
                type="button"
                onClick={() => setUnit('mi')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  unit === 'mi'
                    ? 'bg-white text-[#11181C] shadow-xs'
                    : 'text-[#55605B] hover:text-[#11181C]'
                }`}
              >
                Miles
              </button>
              <button
                type="button"
                onClick={() => setUnit('km')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  unit === 'km'
                    ? 'bg-white text-[#11181C] shadow-xs'
                    : 'text-[#55605B] hover:text-[#11181C]'
                }`}
              >
                Kilometers
              </button>
            </div>
          </div>
        </div>

        {/* GPS Error Alert */}
        {active.gpsError && (
          <div
            role="alert"
            className="bg-[#FDF2F2] border border-[#F3C6C2] text-[#8F2317] rounded-2xl px-4 py-3.5 text-sm flex items-start gap-3"
          >
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-medium">{active.gpsError}</p>
            </div>
          </div>
        )}

        {/* Rolling 7-Walk Overwrite Notification */}
        {overwroteNotice && (
          <div className="bg-white border border-[#DDE1DC] rounded-2xl px-4 py-3 text-xs sm:text-sm text-[#37423C] flex items-center justify-between gap-3">
            <span>{overwroteNotice}</span>
            <button
              type="button"
              onClick={dismissOverwroteNotice}
              className="text-xs font-medium text-[#146C43] hover:underline whitespace-nowrap shrink-0 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Primary 2-Column Responsive Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Primary Column: Walk Telemetry, Start/Stop/Export Controls, Stop Summary & Rolling 7-Walk History */}
          <div className="lg:col-span-5 space-y-5">
            {/* Walk Control & Live Metrics Card */}
            <section className="bg-white border border-[#DDE1DC] rounded-2xl p-5 space-y-5">
              <div className="flex items-baseline justify-between gap-2">
                <h1 className="font-display text-lg font-semibold text-[#11181C]">
                  {isViewingLive
                    ? 'Current Walk'
                    : displayedWalk
                      ? `Walk #${displayedWalk.walkNumber}`
                      : 'Walk Telemetry'}
                </h1>
                <span className="text-xs text-[#55605B] tabular-nums">
                  {isViewingLive
                    ? 'Live GPS'
                    : displayedWalk
                      ? formatWalkDate(displayedWalk.startedAt)
                      : '2s capture'}
                </span>
              </div>

              {/* 3 Core Walk Metrics: Distance, Time Walked, Average Speed */}
              <div className="grid grid-cols-3 gap-3 pt-1">
                <div className="bg-[#F7F7F5] rounded-xl p-3">
                  <p className="text-xs text-[#55605B] font-medium">Distance</p>
                  <p className="mt-1 font-mono text-xl sm:text-2xl font-semibold text-[#11181C] tabular-nums leading-tight">
                    {distFmt.value}
                  </p>
                  <p className="text-xs text-[#55605B] mt-0.5">{distFmt.label}</p>
                </div>

                <div className="bg-[#F7F7F5] rounded-xl p-3">
                  <p className="text-xs text-[#55605B] font-medium">Time</p>
                  <p className="mt-1 font-mono text-xl sm:text-2xl font-semibold text-[#11181C] tabular-nums leading-tight">
                    {formatDuration(displayedDurationMs)}
                  </p>
                  <p className="text-xs text-[#55605B] mt-0.5">elapsed</p>
                </div>

                <div className="bg-[#F7F7F5] rounded-xl p-3">
                  <p className="text-xs text-[#55605B] font-medium">Avg Speed</p>
                  <p className="mt-1 font-mono text-xl sm:text-2xl font-semibold text-[#11181C] tabular-nums leading-tight">
                    {speedFmt.value}
                  </p>
                  <p className="text-xs text-[#55605B] mt-0.5">{speedFmt.label}</p>
                </div>
              </div>

              {/* Required Action Buttons: Start, Stop, Export Coordinates */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={startWalk}
                  disabled={active.isRecording}
                  className="min-h-[52px] px-4 py-3 rounded-xl bg-[#146C43] hover:bg-[#0F5634] active:scale-[0.98] disabled:bg-[#D5E3DA] disabled:text-[#5C7A6B] text-white font-semibold text-base flex items-center justify-center gap-2 transition-all cursor-pointer disabled:cursor-not-allowed whitespace-nowrap"
                >
                  <Play className="w-4 h-4 fill-current shrink-0" />
                  <span>Start</span>
                </button>

                <button
                  type="button"
                  onClick={stopWalk}
                  disabled={!active.isRecording}
                  className="min-h-[52px] px-4 py-3 rounded-xl bg-[#C93B2B] hover:bg-[#A92E20] active:scale-[0.98] disabled:bg-[#E7D8D6] disabled:text-[#967470] text-white font-semibold text-base flex items-center justify-center gap-2 transition-all cursor-pointer disabled:cursor-not-allowed whitespace-nowrap"
                >
                  <Square className="w-4 h-4 fill-current shrink-0" />
                  <span>Stop</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => setExportOpen(true)}
                disabled={!canExport}
                className="w-full min-h-[48px] px-4 py-2.5 rounded-xl bg-white hover:bg-[#F7F7F5] active:scale-[0.99] border border-[#C8CFC7] disabled:border-[#E5E8E4] disabled:text-[#96A09B] text-[#11181C] font-medium text-sm flex items-center justify-center gap-2 transition-all cursor-pointer disabled:cursor-not-allowed whitespace-nowrap"
              >
                <Download className="w-4 h-4 shrink-0" />
                <span>Export Coordinates for Google Maps</span>
              </button>

              {/* Quiet Unboxed Compression & Latest Coordinate Metadata */}
              <div className="pt-3 border-t border-[#ECEEEB] space-y-1 text-xs text-[#55605B] tabular-nums">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span>{displayedCoordinates.length} coordinates stored</span>
                  <span aria-hidden="true">·</span>
                  <span>{displayedRawCount} GPS samples</span>
                  {compressionPct > 0 && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="text-[#146C43] font-medium">
                        {compressionPct}% compressed
                      </span>
                    </>
                  )}
                </div>
                {latestCoordinate && (
                  <p className="font-mono text-[11px] text-[#6D7873]">
                    Latest fix: {latestCoordinate.lat.toFixed(6)}, {latestCoordinate.lng.toFixed(6)}
                  </p>
                )}
              </div>
            </section>

            {/* Walk Completed Summary Output (shown immediately after pressing Stop) */}
            {lastCompletedWalk && !active.isRecording && (
              <section
                aria-live="polite"
                className="bg-[#EFF7F2] border border-[#BFE0CD] rounded-2xl p-5 space-y-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-[#146C43] shrink-0" />
                    <h2 className="font-display text-base font-semibold text-[#0F472B]">
                      Walk #{lastCompletedWalk.walkNumber} Complete
                    </h2>
                  </div>
                  <span className="text-xs font-mono text-[#146C43] tabular-nums">
                    Slot {lastCompletedWalk.slot}/{MAX_SAVED_WALKS}
                  </span>
                </div>

                <dl className="grid grid-cols-3 gap-2 pt-1 text-sm">
                  <div>
                    <dt className="text-xs text-[#3C6650]">Distance walked</dt>
                    <dd className="font-mono font-semibold text-[#0F472B] tabular-nums mt-0.5">
                      {formatDistance(lastCompletedWalk.distanceMeters, unit).value}{' '}
                      {formatDistance(lastCompletedWalk.distanceMeters, unit).label}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[#3C6650]">Time walked</dt>
                    <dd className="font-mono font-semibold text-[#0F472B] tabular-nums mt-0.5">
                      {formatDurationReadable(lastCompletedWalk.durationMs)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[#3C6650]">Average speed</dt>
                    <dd className="font-mono font-semibold text-[#0F472B] tabular-nums mt-0.5">
                      {formatSpeed(lastCompletedWalk.averageSpeedMps, unit).value}{' '}
                      {formatSpeed(lastCompletedWalk.averageSpeedMps, unit).label}
                    </dd>
                  </div>
                </dl>

                <p className="text-xs text-[#3C6650] tabular-nums">
                  Compressed {lastCompletedWalk.rawPointCount} GPS samples down to{' '}
                  {lastCompletedWalk.coordinates.length} straight-line coordinates.
                </p>
              </section>
            )}

            {/* Rolling 7-Walk History List */}
            <section
              id="saved-walks"
              className="bg-white border border-[#DDE1DC] rounded-2xl overflow-hidden"
            >
              <div className="px-5 py-4 border-b border-[#ECEEEB] flex items-center justify-between gap-2">
                <div>
                  <h2 className="font-display text-base font-semibold text-[#11181C]">
                    Recent Walks
                  </h2>
                  <p className="text-xs text-[#55605B] mt-0.5 tabular-nums">
                    {storage.walks.length} of {MAX_SAVED_WALKS} rolling slots used · 8th walk overwrites oldest
                  </p>
                </div>
              </div>

              {storage.walks.length === 0 ? (
                <div className="px-5 py-8 text-center text-sm text-[#55605B]">
                  No walks saved yet. Your last {MAX_SAVED_WALKS} walks will automatically save here when you press Stop.
                </div>
              ) : (
                <ul className="divide-y divide-[#ECEEEB]">
                  {storage.walks.map((walk) => {
                    const isSelected = !active.isRecording && selectedWalkId === walk.id;
                    const wDist = formatDistance(walk.distanceMeters, unit);
                    const wSpeed = formatSpeed(walk.averageSpeedMps, unit);

                    return (
                      <li
                        key={walk.id}
                        className={`flex items-center justify-between gap-2 px-4 py-3 transition-colors ${
                          isSelected ? 'bg-[#F1F7F4]' : 'hover:bg-[#FAFBF9]'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            if (!active.isRecording) {
                              setSelectedWalkId(walk.id);
                            }
                          }}
                          disabled={active.isRecording}
                          className="flex-1 min-w-0 text-left py-1 cursor-pointer disabled:cursor-not-allowed"
                        >
                          <div className="flex items-center gap-2 text-sm font-semibold text-[#11181C]">
                            <span>Walk #{walk.walkNumber}</span>
                            <span className="text-xs font-normal text-[#55605B]">
                              · Slot {walk.slot}
                            </span>
                            {walk.isSimulated && (
                              <span className="text-xs font-normal text-[#55605B]">
                                · Test GPS
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 text-xs text-[#55605B] font-mono tabular-nums flex flex-wrap items-center gap-x-2 gap-y-0.5">
                            <span>
                              {wDist.value} {wDist.label}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>{formatDuration(walk.durationMs)}</span>
                            <span aria-hidden="true">·</span>
                            <span>
                              {wSpeed.value} {wSpeed.label}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>{walk.coordinates.length} pts</span>
                          </div>
                          <p className="text-[11px] text-[#6D7873] mt-0.5">
                            {formatWalkDate(walk.startedAt)}
                          </p>
                        </button>

                        <button
                          type="button"
                          onClick={() => removeWalk(walk.id)}
                          aria-label={`Delete Walk #${walk.walkNumber}`}
                          title="Delete walk"
                          className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-[#747F7A] hover:text-[#C93B2B] hover:bg-[#FDF2F2] transition-colors shrink-0 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>

          {/* Right Column on Desktop: Compressed Coordinates Log ready for Google Maps export */}
          <div id="coordinates" className="lg:col-span-7">
            <CoordinateTable
              coordinates={displayedCoordinates}
              rawPointCount={displayedRawCount}
              title="Compressed Coordinates"
              walkLabel={walkLabel}
            />
          </div>
        </div>
      </main>

      {/* Mobile Ergonomic Thumb-Zone Action Bar (<10% of Pixel viewport height) */}
      <div className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur-md border-t border-[#DDE1DC] px-4 pt-2.5 pb-safe">
        <div className="max-w-lg mx-auto grid grid-cols-3 gap-2.5">
          <button
            type="button"
            onClick={startWalk}
            disabled={active.isRecording}
            className="min-h-[48px] px-3 rounded-xl bg-[#146C43] hover:bg-[#0F5634] disabled:bg-[#D5E3DA] disabled:text-[#5C7A6B] text-white font-semibold text-sm flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:cursor-not-allowed whitespace-nowrap"
          >
            <Play className="w-4 h-4 fill-current shrink-0" />
            <span>Start</span>
          </button>

          <button
            type="button"
            onClick={stopWalk}
            disabled={!active.isRecording}
            className="min-h-[48px] px-3 rounded-xl bg-[#C93B2B] hover:bg-[#A92E20] disabled:bg-[#E7D8D6] disabled:text-[#967470] text-white font-semibold text-sm flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:cursor-not-allowed whitespace-nowrap"
          >
            <Square className="w-4 h-4 fill-current shrink-0" />
            <span>Stop</span>
          </button>

          <button
            type="button"
            onClick={() => setExportOpen(true)}
            disabled={!canExport}
            className="min-h-[48px] px-3 rounded-xl bg-[#11181C] hover:bg-[#232F36] disabled:bg-[#D5DAD4] disabled:text-[#747F7A] text-white font-semibold text-sm flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:cursor-not-allowed whitespace-nowrap"
          >
            <Download className="w-4 h-4 shrink-0" />
            <span>Export</span>
          </button>
        </div>
      </div>

      {/* Export Coordinates Sheet / Modal */}
      <ExportSheet
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        walk={isViewingLive ? null : displayedWalk}
        activeCoordinates={displayedCoordinates}
      />
    </div>
  );
}
