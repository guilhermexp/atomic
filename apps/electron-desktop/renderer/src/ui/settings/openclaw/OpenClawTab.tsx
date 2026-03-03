import React from "react";
import { settingsStyles as ps, type SettingsOutletContext } from "../SettingsPage";
import { ModelProvidersTab } from "../providers/ModelProvidersTab";
import { ConnectorsTab } from "../connectors/ConnectorsTab";
import { SkillsIntegrationsTab } from "../skills/SkillsIntegrationsTab";
import { VoiceRecognitionTab } from "../voice/VoiceRecognitionTab";
import { OtherTab } from "../OtherTab";
import s from "./OpenClawTab.module.css";

type SectionId = "providers" | "models" | "connectors" | "skills" | "voice" | "general";

const SECTIONS: { id: SectionId; label: string; icon: string }[] = [
  { id: "providers", label: "AI Providers", icon: "\u{1F511}" },
  { id: "models", label: "AI Models", icon: "\u{1F916}" },
  { id: "connectors", label: "Connectors", icon: "\u{1F4AC}" },
  { id: "skills", label: "Skills", icon: "\u{26A1}" },
  { id: "voice", label: "Voice", icon: "\u{1F399}" },
  { id: "general", label: "General", icon: "\u{2699}" },
];

export function OpenClawTab(ctx: SettingsOutletContext & { isPaidMode: boolean }) {
  const [activeSection, setActiveSection] = React.useState<SectionId>("providers");

  return (
    <div className={ps.UiSettingsContentInner}>
      <div className={ps.UiSettingsTabTitle}>OpenClaw</div>

      <div className={s.OpenClawLayout}>
        {/* Left sidebar nav */}
        <nav className={s.OpenClawSidebar} aria-label="OpenClaw settings sections">
          {SECTIONS.map(({ id, label, icon }) => (
            <button
              key={id}
              type="button"
              className={`${s.OpenClawNavItem}${activeSection === id ? ` ${s["OpenClawNavItem--active"]}` : ""}`}
              onClick={() => setActiveSection(id)}
              aria-current={activeSection === id ? "page" : undefined}
            >
              <span className={s.OpenClawNavIcon} aria-hidden="true">
                {icon}
              </span>
              {label}
            </button>
          ))}
        </nav>

        {/* Right content pane */}
        <div className={s.OpenClawContent}>
          {activeSection === "providers" && (
            <ModelProvidersTab
              key="providers"
              view="providers"
              isPaidMode={ctx.isPaidMode}
              gw={ctx.gw}
              configSnap={ctx.configSnap ?? null}
              reload={ctx.reload}
              onError={ctx.onError}
            />
          )}
          {activeSection === "models" && (
            <ModelProvidersTab
              key="models"
              view="models"
              isPaidMode={ctx.isPaidMode}
              gw={ctx.gw}
              configSnap={ctx.configSnap ?? null}
              reload={ctx.reload}
              onError={ctx.onError}
            />
          )}
          {activeSection === "connectors" && (
            <ConnectorsTab
              gw={ctx.gw}
              configSnap={ctx.configSnap ?? null}
              reload={ctx.reload}
              onError={ctx.onError}
            />
          )}
          {activeSection === "skills" && (
            <SkillsIntegrationsTab
              state={ctx.state}
              gw={ctx.gw}
              configSnap={ctx.configSnap ?? null}
              reload={ctx.reload}
              onError={ctx.onError}
            />
          )}
          {activeSection === "voice" && (
            <VoiceRecognitionTab
              gw={ctx.gw}
              configSnap={ctx.configSnap ?? null}
              reload={ctx.reload}
              onError={ctx.onError}
            />
          )}
          {activeSection === "general" && <OtherTab onError={ctx.onError} />}
        </div>
      </div>
    </div>
  );
}
