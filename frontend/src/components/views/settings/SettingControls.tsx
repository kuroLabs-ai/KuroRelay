import React from "react";
import { cn } from "../../../lib/cn";

export function SettingSection({
  title,
  description,
  badge,
  children,
}: {
  title: string;
  description?: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-[var(--border-dim)] bg-[var(--bg-s2)] p-5 space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-[var(--border-dim)]">
        <div>
          <h3 className="text-sm font-semibold text-[var(--tx-1)] flex items-center gap-2">
            <span>{title}</span>
            {badge}
          </h3>
          {description && (
            <p className="text-xs text-[var(--tx-3)] mt-0.5">{description}</p>
          )}
        </div>
      </div>
      <div className="space-y-4 divide-y divide-[var(--border-dim)]/40">
        {children}
      </div>
    </div>
  );
}

export function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="pt-3.5 first:pt-0 flex items-start justify-between gap-4">
      <div className="space-y-0.5 max-w-md">
        <label className="text-xs font-medium text-[var(--tx-1)] block">{label}</label>
        {description && (
          <div className="text-[11px] text-[var(--tx-3)] leading-relaxed">{description}</div>
        )}
      </div>
      <div className="shrink-0 flex items-center">{children}</div>
    </div>
  );
}

export function SettingToggle({
  checked,
  onChange,
  disabled = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-1 focus:ring-[var(--lime)]",
        checked ? "bg-[var(--lime)]" : "bg-[var(--bg-s4)]",
        disabled && "opacity-50 cursor-not-allowed"
      )}
    >
      <span
        className={cn(
          "pointer-events-none inline-block h-4 w-4 transform rounded-full shadow-md ring-0 transition duration-200 ease-in-out",
          checked ? "translate-x-4 bg-[#09090b]" : "translate-x-0.5 bg-white"
        )}
      />
    </button>
  );
}

export function SettingInput({
  value,
  onChange,
  type = "text",
  placeholder,
  unit,
  disabled = false,
  className,
}: {
  value: string;
  onChange: (val: string) => void;
  type?: "text" | "number";
  placeholder?: string;
  unit?: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div className="relative flex items-center">
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={cn(
          "h-7 rounded-md border border-[var(--border-dim)] bg-[var(--bg-s1)] px-2.5 text-xs text-[var(--tx-1)] placeholder-[var(--tx-3)]",
          "focus:border-[var(--color-border-focus)] focus:outline-none transition-colors",
          unit ? "pr-8" : "",
          disabled && "opacity-50 cursor-not-allowed",
          className
        )}
      />
      {unit && (
        <span className="absolute right-2 text-[10px] text-[var(--tx-3)] pointer-events-none uppercase font-mono">
          {unit}
        </span>
      )}
    </div>
  );
}

export function SettingSelect({
  value,
  onChange,
  options,
  disabled = false,
}: {
  value: string;
  onChange: (val: string) => void;
  options: { label: string; value: string }[];
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={cn(
        "h-7 rounded-md border border-[var(--border-dim)] bg-[var(--bg-s1)] px-2 text-xs text-[var(--tx-1)]",
        "focus:border-[var(--color-border-focus)] focus:outline-none transition-colors cursor-pointer",
        disabled && "opacity-50 cursor-not-allowed"
      )}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value} className="bg-[var(--bg-s2)] text-[var(--tx-1)]">
          {opt.label}
        </option>
      ))}
    </select>
  );
}
