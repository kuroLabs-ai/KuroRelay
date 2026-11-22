import { ShieldAlert } from "lucide-react";
import type { SettingsState } from "./types";
import {
  SettingSection,
  SettingRow,
  SettingToggle,
  SettingInput,
  SettingSelect,
} from "./SettingControls";

interface Props {
  settings: SettingsState;
  onUpdate: (key: string, value: string) => void;
}

export function NetworkSettingsTab({ settings, onUpdate }: Props) {
  const followRedirects = settings.follow_redirects === "true";
  const verifyTls = settings.verify_tls === "true";
  const allowPrivate = settings.allow_private_network_default === "true";
  const proxyMode = settings.proxy_mode || "system";

  return (
    <div className="space-y-6">
      {/* HTTP Request Execution Defaults */}
      <SettingSection
        title="HTTP & Request Execution"
        description="Configure default transport behavior, connection limits, and redirect rules."
      >
        <SettingRow
          label="Default Request Timeout"
          description="Maximum duration to wait for initial connection and response before timing out."
        >
          <SettingInput
            type="number"
            value={settings.default_timeout_ms || "30000"}
            onChange={(val) => onUpdate("default_timeout_ms", val)}
            unit="ms"
            className="w-32 text-right"
          />
        </SettingRow>

        <SettingRow
          label="Follow HTTP Redirects"
          description="Automatically follow HTTP 301, 302, 307, and 308 redirect chains."
        >
          <SettingToggle
            checked={followRedirects}
            onChange={(checked) => onUpdate("follow_redirects", String(checked))}
          />
        </SettingRow>

        {followRedirects && (
          <SettingRow
            label="Max Redirects Limit"
            description="Prevent endless redirect loops by enforcing a maximum redirect hop count."
          >
            <SettingInput
              type="number"
              value={settings.max_redirects || "5"}
              onChange={(val) => onUpdate("max_redirects", val)}
              className="w-20 text-center"
            />
          </SettingRow>
        )}

        <SettingRow
          label="Default User-Agent"
          description="The User-Agent identifier header attached to outgoing requests when none is explicitly provided."
        >
          <SettingInput
            value={settings.user_agent || "KuroRelay/1.0"}
            onChange={(val) => onUpdate("user_agent", val)}
            className="w-56"
          />
        </SettingRow>

        <SettingRow
          label="Max Response Preview Size"
          description="Limit response body payload rendered in memory to protect UI rendering performance."
        >
          <SettingInput
            type="number"
            value={settings.max_response_size_mb || "50"}
            onChange={(val) => onUpdate("max_response_size_mb", val)}
            unit="MB"
            className="w-28 text-right"
          />
        </SettingRow>
      </SettingSection>

      {/* SSL & Network Security Defaults */}
      <SettingSection
        title="Security & Destination Policy"
        description="Enforce transport certificate validation and local network protection rules."
      >
        <SettingRow
          label="Verify SSL / TLS Certificates"
          description="Validate server certificates against trusted root CAs for HTTPS endpoints."
        >
          <SettingToggle
            checked={verifyTls}
            onChange={(checked) => onUpdate("verify_tls", String(checked))}
          />
        </SettingRow>

        {!verifyTls && (
          <div className="flex items-start gap-2.5 p-3 rounded-lg border border-[var(--warn)]/40 bg-[var(--amber-soft)] text-xs text-[var(--warn)]">
            <ShieldAlert size={15} className="shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <span className="font-semibold">Security Warning</span>
              <p className="text-[11px] leading-relaxed opacity-90">
                Disabling SSL certificate verification permits self-signed certs but makes requests susceptible to man-in-the-middle attacks.
              </p>
            </div>
          </div>
        )}

        <SettingRow
          label="Allow Private Network Access by Default"
          description="Permit outgoing requests to loopback (127.0.0.1) and LAN private IP addresses without per-tab opt-in."
        >
          <SettingToggle
            checked={allowPrivate}
            onChange={(checked) => onUpdate("allow_private_network_default", String(checked))}
          />
        </SettingRow>
      </SettingSection>

      {/* Proxy Settings */}
      <SettingSection
        title="Proxy Configuration"
        description="Route outgoing HTTP and HTTPS requests through an intermediary forward proxy."
      >
        <SettingRow
          label="Proxy Mode"
          description="Choose whether to inherit system environment proxy, connect directly, or use custom proxy."
        >
          <SettingSelect
            value={proxyMode}
            onChange={(val) => onUpdate("proxy_mode", val)}
            options={[
              { label: "System Default", value: "system" },
              { label: "Direct (No Proxy)", value: "none" },
              { label: "Custom Proxy", value: "custom" },
            ]}
          />
        </SettingRow>

        {proxyMode === "custom" && (
          <>
            <SettingRow
              label="Proxy Server URL"
              description="HTTP, HTTPS, or SOCKS5 proxy address (e.g. http://127.0.0.1:8080 or socks5://proxy:1080)."
            >
              <SettingInput
                value={settings.proxy_url || ""}
                onChange={(val) => onUpdate("proxy_url", val)}
                placeholder="http://127.0.0.1:8080"
                className="w-64"
              />
            </SettingRow>

            <SettingRow
              label="Proxy Bypass Hosts"
              description="Comma-separated list of hostnames or IP ranges that bypass the proxy."
            >
              <SettingInput
                value={settings.proxy_bypass || "localhost,127.0.0.1"}
                onChange={(val) => onUpdate("proxy_bypass", val)}
                placeholder="localhost, 127.0.0.1, *.local"
                className="w-64"
              />
            </SettingRow>
          </>
        )}
      </SettingSection>
    </div>
  );
}
