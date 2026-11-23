import { useState } from 'react';
import { Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export function PWAInstallButton() {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  // Hide completely when already launched as an installed standalone PWA
  if (isInstalled) {
    return null;
  }

  const handleClick = async () => {
    if (isInstallable) {
      await install();
      return;
    }
    setShowGuide(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className="min-h-[40px] px-3 py-1.5 rounded-lg bg-[#EFF7F2] hover:bg-[#E1F1E7] border border-[#BFE0CD] text-[#0F5634] text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
      >
        <Smartphone className="w-3.5 h-3.5 shrink-0" />
        <span>{isInstallable ? 'Install App' : 'Install on Phone'}</span>
      </button>

      {showGuide && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/45 backdrop-blur-xs p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="install-guide-title"
          onClick={() => setShowGuide(false)}
        >
          <div
            className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl border border-[#DDE1DC] shadow-xl p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2
                  id="install-guide-title"
                  className="font-display text-lg font-semibold text-[#11181C]"
                >
                  {isIOS
                    ? 'Install Follow Me on iPhone / iPad'
                    : 'Install Follow Me on Your Pixel'}
                </h2>
                <p className="text-xs text-[#55605B] mt-0.5">
                  Runs full-screen from your home screen with offline support
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                aria-label="Close install instructions"
                className="min-h-[44px] min-w-[44px] -mr-2 -mt-2 flex items-center justify-center rounded-xl text-[#55605B] hover:text-[#11181C] hover:bg-[#F1F3F0] transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {isIOS ? (
              <ol className="space-y-2.5 text-sm text-[#37423C] list-decimal list-inside">
                <li>
                  Open the app URL directly in <strong>Safari</strong>.
                </li>
                <li>
                  Tap the <strong>Share</strong> button in the Safari toolbar.
                </li>
                <li>
                  Scroll down and tap <strong>Add to Home Screen</strong>, then{' '}
                  <strong>Add</strong>.
                </li>
              </ol>
            ) : (
              <ol className="space-y-2.5 text-sm text-[#37423C] list-decimal list-inside">
                <li>
                  Open the Shared App URL directly in <strong>Chrome</strong> on
                  your Pixel phone (outside the preview frame).
                </li>
                <li>
                  Tap the <strong>Install App</strong> button here, or tap the
                  three-dot menu (<strong>⋮</strong>) in Chrome.
                </li>
                <li>
                  Select <strong>Add to Home screen</strong> →{' '}
                  <strong>Install</strong>.
                </li>
              </ol>
            )}

            <p className="text-xs text-[#55605B] bg-[#F7F7F5] border border-[#ECEEEB] rounded-xl px-3.5 py-2.5">
              Once installed, Follow Me opens like a standalone app, caches its
              interface for offline hikes, and keeps your 7 rolling walks stored
              locally on your phone.
            </p>

            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="w-full min-h-[46px] rounded-xl bg-[#11181C] hover:bg-[#232F36] text-white text-sm font-medium transition-colors cursor-pointer"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}
