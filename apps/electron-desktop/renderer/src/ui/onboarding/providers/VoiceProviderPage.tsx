import React from "react";

import {
  ActionButton,
  GlassCard,
  HeroPageLayout,
  InlineError,
  PrimaryButton,
  SecondaryButton,
  TextInput,
} from "@shared/kit";
import { getObject } from "@shared/utils/configHelpers";
import { useGatewayRpc } from "@gateway/context";
import { setVoiceProvider, type VoiceProvider } from "@ui/chat/hooks/useVoiceInput";
import { getDesktopApiOrNull } from "@ipc/desktopApi";
import { useWelcomeApiKey } from "../hooks/useWelcomeApiKey";
import type { ConfigSnapshot } from "../hooks/types";
import { useAppDispatch, useAppSelector } from "@store/hooks";
import {
  fetchWhisperModels,
  downloadWhisperModel,
  cancelWhisperDownload,
  whisperActions,
} from "@store/slices/whisperSlice";
import s from "../../settings/voice/VoiceRecognitionTab.module.css";

function detectOpenAiProvider(config: unknown): boolean {
  const cfg = getObject(config);
  const auth = getObject(cfg.auth);
  const profiles = getObject(auth.profiles);
  const order = getObject(auth.order);
  const hasProfile = Object.values(profiles).some((p) => {
    if (!p || typeof p !== "object" || Array.isArray(p)) return false;
    return (p as { provider?: unknown }).provider === "openai";
  });
  const hasOrder = Object.prototype.hasOwnProperty.call(order, "openai");
  return Boolean(hasProfile || hasOrder);
}

export function VoiceProviderPage(props: {
  hasOpenAiProvider: boolean;
  onBack: () => void;
  onSkip: () => void;
  onContinue: () => void;
}) {
  const gw = useGatewayRpc();
  const dispatch = useAppDispatch();
  const models = useAppSelector((st) => st.whisper.models);
  const selectedModel = useAppSelector((st) => st.whisper.selectedModelId);
  const download = useAppSelector((st) => st.whisper.download);

  const [provider, setProvider] = React.useState<VoiceProvider | null>(() => {
    try {
      const v = localStorage.getItem("openclaw:voiceProvider");
      if (v === "openai" || v === "local") return v;
    } catch {
      // localStorage unavailable
    }
    return null;
  });
  const [hasOpenAi, setHasOpenAi] = React.useState(props.hasOpenAiProvider);
  const [openAiKey, setOpenAiKey] = React.useState("");
  const [keyBusy, setKeyBusy] = React.useState(false);
  const [keyError, setKeyError] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<string | null>(null);

  const loadConfig = React.useCallback(async (): Promise<ConfigSnapshot> => {
    return gw.request<ConfigSnapshot>("config.get");
  }, [gw]);

  const { saveApiKey } = useWelcomeApiKey({
    gw,
    loadConfig,
    setError: setKeyError,
    setStatus,
  });

  React.useEffect(() => {
    setHasOpenAi(props.hasOpenAiProvider);
  }, [props.hasOpenAiProvider]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snap = await loadConfig();
        if (cancelled) return;
        setHasOpenAi(detectOpenAiProvider(snap.config));
      } catch {
        // best-effort
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadConfig]);

  React.useEffect(() => {
    dispatch(fetchWhisperModels());
  }, [dispatch]);

  React.useEffect(() => {
    if (download.kind === "downloading") {
      setProvider("local");
    }
  }, [download.kind]);

  const isDownloading = download.kind === "downloading";
  const selectedModelInfo = models.find((m) => m.id === selectedModel);
  const isModelReady = selectedModelInfo?.downloaded ?? false;
  const needsKey = provider === "openai" && !hasOpenAi;

  const handleSelectProvider = React.useCallback(
    (p: VoiceProvider) => {
      setProvider(p);
      const api = getDesktopApiOrNull();
      if (p === "openai") {
        if (isDownloading) dispatch(cancelWhisperDownload());
        if (hasOpenAi) void api?.whisperSetGatewayModel?.("openai");
      } else if (p === "local" && isModelReady) {
        void api?.whisperSetGatewayModel?.(selectedModel);
      }
    },
    [dispatch, isDownloading, hasOpenAi, isModelReady, selectedModel]
  );

  const handleSaveKey = React.useCallback(async () => {
    setKeyBusy(true);
    setKeyError(null);
    try {
      const ok = await saveApiKey("openai", openAiKey);
      if (ok) {
        setOpenAiKey("");
        setHasOpenAi(true);
        if (provider === "openai") {
          const api = getDesktopApiOrNull();
          void api?.whisperSetGatewayModel?.("openai");
        }
      }
    } catch (err) {
      setKeyError(String(err));
    } finally {
      setKeyBusy(false);
    }
  }, [openAiKey, saveApiKey, provider]);

  const handleDownloadModel = React.useCallback(
    (modelId: string) => {
      dispatch(downloadWhisperModel(modelId));
    },
    [dispatch]
  );

  const handleCancelDownload = React.useCallback(() => {
    dispatch(cancelWhisperDownload());
  }, [dispatch]);

  const handleSelectModel = React.useCallback(
    (m: { id: string; downloaded: boolean }) => {
      if (isDownloading) return;
      dispatch(whisperActions.setSelectedModel(m.id));
      if (m.downloaded) {
        const api = getDesktopApiOrNull();
        void api?.whisperSetGatewayModel?.(m.id);
      }
    },
    [dispatch, isDownloading]
  );

  // Persist provider only when it is actually ready to use
  React.useEffect(() => {
    if (!provider) return;
    const ready = (provider === "openai" && hasOpenAi) || (provider === "local" && isModelReady);
    if (ready) {
      setVoiceProvider(provider);
    }
  }, [provider, hasOpenAi, isModelReady]);

  const providerReady =
    (provider === "openai" && hasOpenAi) ||
    (provider === "local" && (isModelReady || isDownloading));

  const handleContinue = React.useCallback(() => {
    const api = getDesktopApiOrNull();
    if (provider === "openai") {
      void api?.whisperSetGatewayModel?.("openai");
    } else if (provider === "local" && isModelReady) {
      void api?.whisperSetGatewayModel?.(selectedModel);
    }
    props.onContinue();
  }, [provider, isModelReady, selectedModel, props.onContinue]);

  const totalSteps = 6;
  const activeStep = 4;

  return (
    <HeroPageLayout variant="compact" align="center" aria-label="Voice provider selection">
      <GlassCard className="UiProviderCard UiGlassCardOnboarding">
        <div className="UiOnboardingDots" aria-label="Onboarding progress">
          {Array.from({ length: totalSteps }).map((_, idx) => (
            <span
              // eslint-disable-next-line react/no-array-index-key
              key={idx}
              className={`UiOnboardingDot ${idx === activeStep ? "UiOnboardingDot--active" : ""}`}
              aria-hidden="true"
            />
          ))}
        </div>

        <div className="UiSectionTitle">Voice Input</div>
        <div className="UiSectionSubtitle">
          Choose how voice input is transcribed. You can change this later in settings.
        </div>

        <div className={s.VoiceOnboardingScroll}>
          {/* Provider selection */}
          <div className={s.VoiceProviderSelect}>
            <button
              type="button"
              className={`${s.VoiceProviderOption}${provider === "openai" ? ` ${s["VoiceProviderOption--active"]}` : ""}`}
              onClick={() => handleSelectProvider("openai")}
            >
              <div className={s.VoiceProviderTitle}>OpenAI Whisper</div>
              <div className={s.VoiceProviderDesc}>
                Higher accuracy transcription via OpenAI API. Requires an API key.
              </div>
              {provider === "openai" && hasOpenAi && (
                <div className={s.VoiceProviderStatus}>API key configured</div>
              )}
            </button>

            <button
              type="button"
              className={`${s.VoiceProviderOption}${provider === "local" ? ` ${s["VoiceProviderOption--active"]}` : ""}`}
              onClick={() => handleSelectProvider("local")}
            >
              <div className={s.VoiceProviderTitle}>Local Whisper</div>
              <div className={s.VoiceProviderDesc}>
                On-device transcription using a local Whisper model. Free, private, no API key
                needed.
              </div>
              {isModelReady && (
                <div className={s.VoiceProviderStatus}>
                  Model ready ({selectedModelInfo?.label})
                </div>
              )}
            </button>
          </div>

          {/* Local Whisper: model selection + download */}
          {provider === "local" && models.length > 0 && (
            <>
              <div className={s.VoiceModelSelectTitle}>Select Whisper model</div>
              <div className={s.VoiceModelSelect}>
                {models.map((m) => {
                  const isSelected = m.id === selectedModel;
                  return (
                    <div
                      key={m.id}
                      role="radio"
                      aria-checked={isSelected}
                      tabIndex={isDownloading ? -1 : 0}
                      className={`${s.VoiceModelRow}${isSelected ? ` ${s["VoiceModelRow--active"]}` : ""}${isDownloading ? ` ${s["VoiceModelRow--disabled"]}` : ""}`}
                      onClick={() => handleSelectModel(m)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handleSelectModel(m);
                        }
                      }}
                    >
                      <div className={s.VoiceModelRadio}>
                        <div className={s.VoiceModelRadioDot} />
                      </div>
                      <div className={s.VoiceModelInfo}>
                        <div>
                          <span className={s.VoiceModelLabel}>{m.label}</span>
                          <span className={s.VoiceModelSize}>{m.sizeLabel}</span>
                        </div>
                        <div className={s.VoiceModelDesc}>{m.description}</div>
                      </div>
                      {m.downloaded && <span className={s.VoiceModelCheck}>&#10003;</span>}
                    </div>
                  );
                })}
              </div>

              {selectedModelInfo && !selectedModelInfo.downloaded && !isDownloading && (
                <div className={s.VoiceModelAction}>
                  <div className={s.VoiceProviderDesc}>
                    {selectedModelInfo.label} ({selectedModelInfo.sizeLabel}) is not downloaded yet.
                  </div>
                  <ActionButton onClick={() => handleDownloadModel(selectedModel)}>
                    Download {selectedModelInfo.label} ({selectedModelInfo.sizeLabel})
                  </ActionButton>
                </div>
              )}

              {isDownloading && download.kind === "downloading" && (
                <div className={s.VoiceModelAction}>
                  <div className={s.VoiceDownloadRow}>
                    <div className={s.VoiceProviderDesc}>Downloading… {download.percent}%</div>
                    <button
                      type="button"
                      className={s.VoiceCancelButton}
                      onClick={handleCancelDownload}
                      aria-label="Cancel download"
                      title="Cancel download"
                    >
                      ✕
                    </button>
                  </div>
                  <div className={s.VoiceProgressBar}>
                    <div
                      className={s.VoiceProgressFill}
                      style={{ width: `${download.percent}%` }}
                    />
                  </div>
                </div>
              )}

              {selectedModelInfo?.downloaded && (
                <div className={s.VoiceModelAction}>
                  <div className={s.VoiceModelActionReady}>
                    &#10003; {selectedModelInfo.label} is ready
                  </div>
                </div>
              )}

              {download.kind === "error" && (
                <div className={s.VoiceModelAction}>
                  <InlineError>{download.message}</InlineError>
                  <ActionButton onClick={() => handleDownloadModel(selectedModel)}>
                    Retry download
                  </ActionButton>
                </div>
              )}
            </>
          )}

          {/* OpenAI: API key input when not configured */}
          {needsKey && (
            <div className={s.VoiceKeySection}>
              <InlineError>
                OpenAI is not configured. Add an API key to use Whisper transcription.
              </InlineError>
              {keyError && <InlineError>{keyError}</InlineError>}
              <label className={s.VoiceKeyLabel}>OpenAI API key</label>
              <TextInput
                type="password"
                value={openAiKey}
                onChange={setOpenAiKey}
                placeholder="sk-..."
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                disabled={keyBusy}
              />
              <div className={s.VoiceKeyActions}>
                <ActionButton
                  disabled={keyBusy || !openAiKey.trim()}
                  onClick={() => void handleSaveKey()}
                >
                  {keyBusy ? "Saving..." : "Save key"}
                </ActionButton>
              </div>
            </div>
          )}

          {status && <div className={s.VoiceStatus}>{status}</div>}
        </div>

        {/* Navigation */}
        <div className="UiProviderContinueRow">
          <div>
            <button className="UiTextButton" type="button" onClick={props.onBack}>
              Back
            </button>
          </div>
          <div className="UiSkillsBottomActions">
            <SecondaryButton size={"sm"} onClick={props.onSkip}>
              Skip
            </SecondaryButton>
            <PrimaryButton size={"sm"} disabled={!providerReady} onClick={handleContinue}>
              Continue
            </PrimaryButton>
          </div>
        </div>
      </GlassCard>
    </HeroPageLayout>
  );
}
