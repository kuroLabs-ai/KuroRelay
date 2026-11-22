import { useEffect, useRef } from "react";

interface DropdownOptions {
  isOpen: boolean;
  onClose: () => void;
  closeOnMouseLeave?: boolean;
  mouseLeaveDelayMs?: number;
}

export function useDropdown<T extends HTMLElement = HTMLDivElement>({
  isOpen,
  onClose,
  closeOnMouseLeave = true,
  mouseLeaveDelayMs = 250,
}: DropdownOptions) {
  const containerRef = useRef<T>(null);
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
      if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
    };
  }, [isOpen, onClose]);

  const onMouseEnter = () => {
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
  };

  const onMouseLeave = () => {
    if (!closeOnMouseLeave || !isOpen) return;
    if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
    leaveTimerRef.current = setTimeout(() => {
      onClose();
    }, mouseLeaveDelayMs);
  };

  return {
    ref: containerRef,
    onMouseEnter,
    onMouseLeave,
  };
}
