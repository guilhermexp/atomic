import React from "react";

import { getDesktopApiOrNull } from "@ipc/desktopApi";
import { errorToMessage } from "@shared/toast";
import s from "./DefenderBanner.module.css";

function ShieldIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M8 1.5L2.5 3.5V7.5C2.5 11 5 13.5 8 14.5C11 13.5 13.5 11 13.5 7.5V3.5L8 1.5Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8 5.5V8.5M8 10.5H8.005"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BtnSpinner() {
  return <span className={s["DefenderBanner-spinner"]} />;
}

/**
 * Banner that prompts the user to add Windows Defender exclusions
 * for the app's data directories and node.exe. Only renders on Windows
 * and only if the user hasn't already applied exclusions or dismissed the banner.
 */
export function DefenderBanner() {
  const [visible, setVisible] = React.useState(false);
  const [applying, setApplying] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const checkedRef = React.useRef(false);

  React.useEffect(() => {
    if (checkedRef.current) return;
    checkedRef.current = true;

    const api = getDesktopApiOrNull();
    if (!api) return;

    void api.defenderStatus().then((status) => {
      if (status.isWindows && !status.applied && !status.dismissed) {
        setVisible(true);
      }
    });
  }, []);

  if (!visible) return null;

  const handleApply = async () => {
    const api = getDesktopApiOrNull();
    if (!api) return;

    setApplying(true);
    setError(null);

    try {
      const result = await api.defenderApplyExclusions();
      if (result.ok) {
        setVisible(false);
      } else {
        setError(result.error ?? "Failed to apply exclusions");
      }
    } catch (err) {
      setError(errorToMessage(err));
    } finally {
      setApplying(false);
    }
  };

  const handleDismiss = async () => {
    const api = getDesktopApiOrNull();
    if (!api) return;

    await api.defenderDismiss();
    setVisible(false);
  };

  return (
    <div className={s.DefenderBanner} role="status" aria-live="polite">
      <div className={s["DefenderBanner-icon"]}>
        <ShieldIcon />
      </div>

      <div className={s["DefenderBanner-body"]}>
        <span className={s["DefenderBanner-title"]}>Improve performance</span>
        <span className={s["DefenderBanner-text"]}>
          Windows Defender real-time scanning can slow down the app. Add an exclusion to speed
          things up.
        </span>

        {error && <span className={s["DefenderBanner-error"]}>{error}</span>}

        <div className={s["DefenderBanner-actions"]}>
          <button
            className={`${s["DefenderBanner-btn"]} ${s["DefenderBanner-btn--primary"]}`}
            disabled={applying}
            onClick={() => void handleApply()}
          >
            {applying ? <BtnSpinner /> : "Fix automatically"}
          </button>
          <button
            className={`${s["DefenderBanner-btn"]} ${s["DefenderBanner-btn--dismiss"]}`}
            onClick={() => void handleDismiss()}
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
