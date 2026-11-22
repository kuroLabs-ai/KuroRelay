import React, { useEffect, useLayoutEffect, useRef, useState } from "react";

export interface ContextMenuItem {
  label: string;
  icon?: React.ReactNode;
  onSelect?: () => void;
  disabled?: boolean;
  danger?: boolean;
  tone?: "lime" | "amber";
  separator?: boolean;
  children?: ContextMenuItem[];
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  header?: React.ReactNode;
  onClose: () => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, items, header, onClose }) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const submenuTimerRef = useRef<number | null>(null);
  const [openSubmenu, setOpenSubmenu] = useState<string | null>(null);
  const [position, setPosition] = useState({ left: x, top: y, ready: false });

  useEffect(() => {
    return () => {
      if (submenuTimerRef.current) window.clearTimeout(submenuTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const handleMouseDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) onClose();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }

      if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Home" && event.key !== "End") {
        return;
      }
      const menuItems = Array.from(
        menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? [],
      );
      if (menuItems.length === 0) return;
      event.preventDefault();
      const currentIndex = menuItems.indexOf(document.activeElement as HTMLButtonElement);
      const nextIndex = event.key === "Home"
        ? 0
        : event.key === "End"
          ? menuItems.length - 1
          : (currentIndex + (event.key === "ArrowDown" ? 1 : -1) + menuItems.length) % menuItems.length;
      menuItems[nextIndex]?.focus();
    };
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const bounds = menu.getBoundingClientRect();
    const left = Math.max(8, Math.min(x, window.innerWidth - bounds.width - 8));
    const top = Math.max(8, Math.min(y, window.innerHeight - bounds.height - 8));
    setPosition({ left, top, ready: true });
  }, [x, y, items, openSubmenu]);

  useEffect(() => {
    menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus();
  }, []);

  const handleItemMouseEnter = (key: string, hasChildren: boolean) => {
    if (submenuTimerRef.current) {
      window.clearTimeout(submenuTimerRef.current);
      submenuTimerRef.current = null;
    }
    if (hasChildren) {
      setOpenSubmenu(key);
    } else {
      setOpenSubmenu(null);
    }
  };

  const handleItemMouseLeave = (hasChildren: boolean) => {
    if (hasChildren) {
      submenuTimerRef.current = window.setTimeout(() => {
        setOpenSubmenu(null);
      }, 250);
    }
  };

  const renderItems = (menuItems: ContextMenuItem[], parentKey = "") => menuItems.map((item, index) => {
    const key = `${parentKey}${index}-${item.label}`;
    if (item.separator) {
      return <div key={key} className="my-1 border-b border-[var(--border-dim)]" />;
    }

    const hasChildren = !!item.children?.length;
    const isOpen = openSubmenu === key;
    return (
      <div
        key={key}
        onMouseEnter={() => handleItemMouseEnter(key, hasChildren)}
        onMouseLeave={() => handleItemMouseLeave(hasChildren)}
      >
        <button
          type="button"
          role="menuitem"
          tabIndex={-1}
          disabled={item.disabled}
          aria-expanded={hasChildren ? isOpen : undefined}
          onClick={(event) => {
            event.stopPropagation();
            if (hasChildren) {
              setOpenSubmenu(isOpen ? null : key);
              return;
            }
            item.onSelect?.();
            onClose();
          }}
          className={[
            "flex w-full items-center gap-2.5 px-2.5 py-1.5 text-left rounded-md transition-colors text-xs cursor-pointer",
            item.disabled
              ? "cursor-not-allowed opacity-40"
              : item.danger
                ? "text-[var(--color-status-error)] hover:bg-[var(--color-status-error-dim)]"
                : item.tone === "lime"
                  ? "text-[var(--color-accent-lime)] hover:bg-[var(--color-accent-lime-dim)] font-medium"
                  : item.tone === "amber"
                    ? "text-[var(--amber)] hover:bg-[var(--color-surface-elevated)] font-medium"
                    : "text-[var(--color-text-primary)] hover:bg-[var(--color-surface-elevated)]",
            "outline-none focus-visible:bg-[var(--color-surface-elevated)]",
          ].join(" ")}
        >
          <span className="flex w-4 shrink-0 items-center justify-center text-[var(--color-text-secondary)]">{item.icon}</span>
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
          {hasChildren && <span className="ml-2 text-[10px] text-[var(--color-text-muted)]">›</span>}
        </button>
        {hasChildren && isOpen && (
          <div
            role="menu"
            className="ml-4 mr-1 my-0.5 border-l border-[var(--color-border-subtle)] pl-1.5 space-y-0.5"
          >
            {renderItems(item.children!, `${key}/`)}
          </div>
        )}
      </div>
    );
  });

  return (
    <div
      ref={menuRef}
      role="menu"
      tabIndex={-1}
      className="fixed z-50 w-52 max-w-[calc(100vw-16px)] max-h-[calc(100dvh-16px)] overflow-y-auto rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-modal)]/95 backdrop-blur-md p-1 text-xs text-[var(--color-text-primary)] shadow-2xl select-none animate-in fade-in zoom-in-95 duration-100"
      style={{ left: position.left, top: position.top, visibility: position.ready ? "visible" : "hidden" }}
      onContextMenu={(event) => event.preventDefault()}
    >
      {header !== undefined && (
        <div className="truncate border-b border-[var(--color-border-subtle)] px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider text-[var(--color-text-muted)] mb-1">
          {header}
        </div>
      )}
      <div className="space-y-0.5">
        {renderItems(items)}
      </div>
    </div>
  );
};
