import type { Coordinate } from '../types/walk';
import { calculateCompressionPercent } from '../utils/geo';

interface CoordinateTableProps {
  coordinates: Coordinate[];
  rawPointCount: number;
  title: string;
}

export function CoordinateTable({
  coordinates,
  rawPointCount,
  title,
}: CoordinateTableProps) {
  const savedPct = calculateCompressionPercent(rawPointCount, coordinates.length);

  return (
    <section className="bg-white border border-[#DDE1DC] rounded-2xl overflow-hidden">
      <div className="px-4 py-3.5 border-b border-[#ECEEEB] flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-[#11181C]">{title}</h2>
          <p className="text-xs text-[#55605B] mt-0.5 tabular-nums">
            {coordinates.length} stored{' '}
            {coordinates.length === 1 ? 'coordinate' : 'coordinates'}
            {rawPointCount > 0 && (
              <>
                {' · '}
                {rawPointCount} raw GPS {rawPointCount === 1 ? 'sample' : 'samples'}
                {savedPct > 0 ? ` · ${savedPct}% straight-line reduction` : ''}
              </>
            )}
          </p>
        </div>
      </div>

      {coordinates.length === 0 ? (
        <div className="px-4 py-10 text-center text-sm text-[#55605B]">
          Coordinates captured every 2 seconds will appear here once you press Start.
        </div>
      ) : (
        <div className="overflow-x-auto max-h-[340px] overflow-y-auto">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 bg-[#F7F7F5] border-b border-[#ECEEEB] text-xs font-medium text-[#55605B]">
              <tr>
                <th className="py-2.5 pl-4 pr-2 font-medium">#</th>
                <th className="py-2.5 px-2 font-medium">Latitude</th>
                <th className="py-2.5 px-2 font-medium">Longitude</th>
                <th className="py-2.5 pl-2 pr-4 font-medium text-right">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0F2EE] font-mono text-xs tabular-nums text-[#11181C]">
              {coordinates.map((coord, idx) => (
                <tr key={`${coord.timestamp}-${idx}`} className="hover:bg-[#FAFBF9]">
                  <td className="py-2.5 pl-4 pr-2 text-[#55605B]">{idx + 1}</td>
                  <td className="py-2.5 px-2">{coord.lat.toFixed(6)}</td>
                  <td className="py-2.5 px-2">{coord.lng.toFixed(6)}</td>
                  <td className="py-2.5 pl-2 pr-4 text-right text-[#55605B]">
                    {new Date(coord.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
