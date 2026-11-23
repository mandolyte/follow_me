import { useMemo, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  FileSpreadsheet,
  Map as MapIcon,
  Route,
  X,
} from 'lucide-react';
import type { Coordinate, WalkRecord } from '../types/walk';
import {
  buildCoordinatesCsv,
  buildCoordinatesGpx,
  buildGoogleMapsKml,
  buildGoogleMapsRouteUrl,
  buildPlainCoordinateList,
  buildWalkExportMeta,
  triggerFileDownload,
} from '../utils/exportFormats';

interface ExportSheetProps {
  open: boolean;
  onClose: () => void;
  walk: WalkRecord | null;
  activeCoordinates: Coordinate[];
}

export function ExportSheet({
  open,
  onClose,
  walk,
  activeCoordinates,
}: ExportSheetProps) {
  const [copied, setCopied] = useState(false);
  const [lastDownloaded, setLastDownloaded] = useState<string | null>(null);

  const meta = useMemo(
    () => buildWalkExportMeta(walk, activeCoordinates),
    [walk, activeCoordinates]
  );

  const googleMapsUrl = useMemo(
    () => buildGoogleMapsRouteUrl(meta.coordinates),
    [meta.coordinates]
  );

  const plainPreview = useMemo(
    () => buildPlainCoordinateList(meta.coordinates),
    [meta.coordinates]
  );

  if (!open) return null;

  const hasCoords = meta.coordinates.length > 0;

  const handleDownloadKml = () => {
    if (!hasCoords) return;
    const kml = buildGoogleMapsKml(meta.coordinates, meta.title, meta.description);
    triggerFileDownload(
      kml,
      `${meta.slug}.kml`,
      'application/vnd.google-earth.kml+xml'
    );
    setLastDownloaded(`${meta.slug}.kml`);
  };

  const handleDownloadCsv = () => {
    if (!hasCoords) return;
    const csv = buildCoordinatesCsv(meta.coordinates);
    triggerFileDownload(csv, `${meta.slug}.csv`, 'text/csv;charset=utf-8');
    setLastDownloaded(`${meta.slug}.csv`);
  };

  const handleDownloadGpx = () => {
    if (!hasCoords) return;
    const gpx = buildCoordinatesGpx(meta.coordinates, meta.title);
    triggerFileDownload(gpx, `${meta.slug}.gpx`, 'application/gpx+xml');
    setLastDownloaded(`${meta.slug}.gpx`);
  };

  const handleCopyCoordinates = async () => {
    if (!hasCoords) return;
    try {
      await navigator.clipboard.writeText(plainPreview);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      // Fallback copy via temporary textarea
      const el = document.createElement('textarea');
      el.value = plainPreview;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/45 backdrop-blur-xs p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-sheet-title"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-2xl border border-[#DDE1DC] shadow-xl max-h-[88vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile grab handle */}
        <div className="sm:hidden pt-3 pb-1 flex justify-center">
          <div className="w-10 h-1.5 rounded-full bg-[#D0D5CE]" />
        </div>

        <div className="flex items-start justify-between gap-4 px-5 pt-4 pb-3 border-b border-[#ECEEEB]">
          <div>
            <h2
              id="export-sheet-title"
              className="text-lg font-semibold text-[#11181C]"
            >
              Export Coordinates for Google Maps
            </h2>
            <p className="text-xs text-[#55605B] mt-0.5">
              {meta.title} · {meta.coordinates.length} compressed{' '}
              {meta.coordinates.length === 1 ? 'coordinate' : 'coordinates'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close export dialog"
            className="min-h-[44px] min-w-[44px] -mr-2 -mt-2 flex items-center justify-center rounded-xl text-[#55605B] hover:text-[#11181C] hover:bg-[#F1F3F0] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          {!hasCoords ? (
            <div className="py-8 text-center text-sm text-[#55605B]">
              No coordinates recorded yet. Press Start to begin tracking a walk.
            </div>
          ) : (
            <>
              {/* Primary recommended export for Google My Maps */}
              <button
                type="button"
                onClick={handleDownloadKml}
                className="w-full min-h-[52px] px-4 py-3 rounded-xl bg-[#146C43] hover:bg-[#0F5634] text-white font-medium text-sm flex items-center justify-between gap-3 transition-colors cursor-pointer"
              >
                <span className="flex items-center gap-3 text-left">
                  <MapIcon className="w-5 h-5 shrink-0" />
                  <span>
                    <span className="block font-semibold">
                      Download KML for Google My Maps
                    </span>
                    <span className="block text-xs text-white/80 font-normal">
                      Import directly into Google My Maps to plot the full trail &amp; pins
                    </span>
                  </span>
                </span>
                <Download className="w-4 h-4 shrink-0" />
              </button>

              {/* Secondary Google Maps / GPS formats */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={handleDownloadCsv}
                  className="min-h-[48px] px-3.5 py-2.5 rounded-xl bg-[#F7F7F5] hover:bg-[#ECEEEB] border border-[#DDE1DC] text-[#11181C] text-sm font-medium flex items-center justify-between gap-2 transition-colors cursor-pointer"
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <FileSpreadsheet className="w-4 h-4 text-[#146C43] shrink-0" />
                    <span className="truncate">Download CSV</span>
                  </span>
                  <span className="text-xs text-[#55605B] font-mono shrink-0">.csv</span>
                </button>

                <button
                  type="button"
                  onClick={handleDownloadGpx}
                  className="min-h-[48px] px-3.5 py-2.5 rounded-xl bg-[#F7F7F5] hover:bg-[#ECEEEB] border border-[#DDE1DC] text-[#11181C] text-sm font-medium flex items-center justify-between gap-2 transition-colors cursor-pointer"
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <Route className="w-4 h-4 text-[#146C43] shrink-0" />
                    <span className="truncate">Download GPX</span>
                  </span>
                  <span className="text-xs text-[#55605B] font-mono shrink-0">.gpx</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={handleCopyCoordinates}
                  className="min-h-[48px] px-3.5 py-2.5 rounded-xl bg-white hover:bg-[#F7F7F5] border border-[#DDE1DC] text-[#11181C] text-sm font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4 text-[#146C43]" />
                      <span>Copied Lat/Lng Pairs</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 text-[#55605B]" />
                      <span>Copy Coordinates</span>
                    </>
                  )}
                </button>

                {googleMapsUrl && (
                  <a
                    href={googleMapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-[48px] px-3.5 py-2.5 rounded-xl bg-white hover:bg-[#F7F7F5] border border-[#DDE1DC] text-[#11181C] text-sm font-medium flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
                  >
                    <ExternalLink className="w-4 h-4 text-[#146C43]" />
                    <span>Open in Google Maps</span>
                  </a>
                )}
              </div>

              {lastDownloaded && (
                <p className="text-xs text-[#146C43] font-medium">
                  Downloaded {lastDownloaded}
                </p>
              )}

              {/* Preview of latitude, longitude pairs */}
              <div className="pt-2 border-t border-[#ECEEEB]">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-[#55605B]">
                    Latitude, Longitude Preview
                  </span>
                  <span className="text-xs font-mono text-[#55605B] tabular-nums">
                    {meta.coordinates.length} rows
                  </span>
                </div>
                <pre className="bg-[#F7F7F5] border border-[#DDE1DC] rounded-xl p-3 text-xs font-mono text-[#1E2923] max-h-40 overflow-y-auto tabular-nums leading-relaxed">
                  {plainPreview}
                </pre>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
