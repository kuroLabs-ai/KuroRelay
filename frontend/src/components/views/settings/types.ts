export interface SettingsState {
  // Network
  default_timeout_ms: string;
  max_history_records: string;
  follow_redirects: string;
  max_redirects: string;
  verify_tls: string;
  allow_private_network_default: string;
  user_agent: string;
  max_response_size_mb: string;
  proxy_mode: string;
  proxy_url: string;
  proxy_bypass: string;

  // History & Privacy
  auto_save_history: string;
  redact_sensitive_headers: string;

  // Editor & UI
  app_accent_color: string;
  monaco_font_size: string;
  monaco_word_wrap: string;
  monaco_tab_size: string;
  monaco_minimap: string;
  monaco_format_on_paste: string;
  split_layout: string;
  confirm_close_dirty: string;

  // Logging & System
  log_level: string;

  [key: string]: string;
}

export type SettingsTabId = "network" | "editor" | "storage" | "security" | "about" | "kuro" | "shortcuts";
