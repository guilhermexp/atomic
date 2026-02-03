import React from "react";

export type ConsentDesktopApi = NonNullable<Window["openclawDesktop"]> & {
  getConsentInfo?: () => Promise<{ accepted: boolean }>;
  acceptConsent?: () => Promise<{ ok: true }>;
};

export function ConsentScreen({ onAccepted }: { onAccepted: () => void }) {
  const api = window.openclawDesktop as ConsentDesktopApi | undefined;
  const [checked, setChecked] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const accept = React.useCallback(async () => {
    if (!checked || busy) {
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await api?.acceptConsent?.();
      onAccepted();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }, [api, busy, checked, onAccepted]);

  return (
    <div className="ConsentShell" role="dialog" aria-modal="true" aria-label="User agreement">
      <div className="ConsentTopbar">
        <div className="ConsentBrand" aria-label="Atomic Bot">
          <span className="ConsentMark" aria-hidden="true">
            +
          </span>
          <span className="ConsentBrandText">ATOMIC BOT</span>
        </div>
      </div>

      <div className="ConsentHero">
        <div className="ConsentTitle">USER AGREEMENT</div>
        <div className="ConsentSubtitle">Please read the following terms before continuing.</div>

        <div className="ConsentCard">
          <div className="ConsentBody">
            <p>
              This is placeholder text for design iteration. By accepting, you acknowledge that this desktop app may
              start a local Gateway process on your machine, store configuration under your user profile, and
              communicate with local services.
            </p>
            <p>
              You are responsible for ensuring you have the right to use any third-party services you connect, and for
              reviewing logs and security settings. This text will be replaced with final legal copy.
            </p>
            <p>
              If you do not agree, you should close the application. Acceptance is stored locally and shown only on the
              first launch.
            </p>
          </div>

          <label className="ConsentCheck">
            <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
            <span>I have read and accept</span>
          </label>

          {error ? <div className="ConsentError">{error}</div> : null}

          <button className="ConsentButton" disabled={!checked || busy} onClick={() => void accept()}>
            {busy ? "..." : "Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}

