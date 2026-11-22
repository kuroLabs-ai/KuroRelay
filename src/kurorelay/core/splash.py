"""Modern native splash screen rendered with PIL + Tkinter.

Features:
- Perfectly centered on primary monitor using physical metrics and DPI awareness.
- Dark obsidian aesthetic (#0c0e12) matching KuroRelay.
- Ambient radial neon glow around the Kuro logo.
- Version pill badge "v0.1.0" with neon border.
- Sleek animated progress bar (0-100%) with percentage readout and status text.
- Thread-safe API and smooth alpha fade-out transition.
"""
from __future__ import annotations

import sys
import threading
import time
from pathlib import Path
from typing import Optional

# Set DPI awareness before any GUI toolkit initializes on Windows
if sys.platform == "win32":
    try:
        import ctypes
        ctypes.windll.shcore.SetProcessDpiAwareness(1)
    except Exception:
        try:
            ctypes.windll.user32.SetProcessDPIAware()
        except Exception:
            pass

# ── Design Constants ──────────────────────────────────────────────────────────
_WIN_W = 520
_WIN_H = 350

_BG_COLOR     = "#0c0e12"   # deep obsidian
_BORDER_COLOR = "#1e242d"   # subtle outer border
_ACCENT_LIME  = "#b8ff34"   # brand neon lime
_ACCENT_DIM   = "#162016"   # badge background
_TX_MAIN      = "#ffffff"   # main title
_TX_SUB       = "#64748b"   # tagline
_TX_STATUS    = "#94a3b8"   # dynamic status text
_TX_FOOTER    = "#475569"   # footer copyright/build
_BAR_TRACK    = "#181d24"   # progress track bg
_BAR_BORDER   = "#222933"   # progress track border

_BAR_X1 = 80
_BAR_X2 = 440
_BAR_Y  = 256
_BAR_H  = 4


class SplashScreen:
    """Native Tkinter splash window with custom rendered background & smooth animation."""

    def __init__(self, logo_path: Optional[str] = None, version: str = "0.1.0") -> None:
        self._logo_path = logo_path
        self._version = version
        self._root = None
        self._thread: Optional[threading.Thread] = None
        self._ready = threading.Event()
        self._closed = False

        # Canvas items
        self._canvas = None
        self._bg_photo = None
        self._bar_item = None
        self._status_item = None
        self._pct_item = None

        # Animation state
        self._current_pct = 0.0
        self._target_pct = 0.0
        self._animating = False

    # ── Public API ────────────────────────────────────────────────────────────

    def show(self) -> None:
        """Start the splash window in a background daemon thread."""
        self._thread = threading.Thread(target=self._run, daemon=True, name="KuroSplashThread")
        self._thread.start()
        self._ready.wait(timeout=3)

    def set_status(self, text: str) -> None:
        """Update the status label (thread-safe)."""
        if self._root and self._status_item and not self._closed:
            try:
                self._root.after(0, lambda: self._canvas.itemconfigure(self._status_item, text=text))
            except Exception:
                pass

    def set_progress(self, pct: int) -> None:
        """Set progress 0-100 with smooth animation (thread-safe)."""
        self._target_pct = max(0.0, min(100.0, float(pct)))
        if self._root and self._canvas and not self._closed:
            try:
                self._root.after(0, self._start_progress_animation)
            except Exception:
                pass

    def close(self) -> None:
        """Fade out and destroy the splash window (thread-safe)."""
        if self._closed:
            return
        self._closed = True
        if self._root:
            try:
                self._root.after(0, self._fade_out)
            except Exception:
                pass

    # ── Background Image Generation (PIL) ─────────────────────────────────────

    def _render_card_image(self):
        """Pre-render the complete high-resolution card artwork with PIL."""
        from PIL import Image, ImageDraw, ImageFont

        img = Image.new("RGBA", (_WIN_W, _WIN_H), _BG_COLOR)
        draw = ImageDraw.Draw(img)

        # 1. Subtle Outer Border
        draw.rectangle([0, 0, _WIN_W - 1, _WIN_H - 1], outline=_BORDER_COLOR, width=1)

        # 2. Glowing Neon Accent line on top
        draw.line([(50, 0), (_WIN_W - 50, 0)], fill=_ACCENT_LIME, width=2)

        # 3. Ambient Radial Neon Glow behind the logo
        glow_size = 180
        glow = Image.new("RGBA", (glow_size, glow_size), (0, 0, 0, 0))
        gdraw = ImageDraw.Draw(glow)
        center = glow_size // 2
        for r in range(center, 0, -2):
            alpha = int(45 * (1 - r / center) ** 1.8)
            gdraw.ellipse([center - r, center - r, center + r, center + r], fill=(184, 255, 52, alpha))
        img.paste(glow, (_WIN_W // 2 - center, 20), glow)

        # 4. Logo with circular mask and lime outline
        logo_loaded = False
        if self._logo_path and Path(self._logo_path).is_file():
            try:
                logo_raw = Image.open(self._logo_path).convert("RGBA")
                logo_size = 80
                logo = logo_raw.resize((logo_size, logo_size), Image.LANCZOS)

                # Circular mask
                mask = Image.new("L", (logo_size, logo_size), 0)
                ImageDraw.Draw(mask).ellipse([0, 0, logo_size, logo_size], fill=255)

                logo_x = (_WIN_W - logo_size) // 2
                logo_y = 66 - (logo_size // 2)

                # Crisp outer neon ring
                ring_pad = 4
                draw.ellipse(
                    [logo_x - ring_pad, logo_y - ring_pad, logo_x + logo_size + ring_pad, logo_y + logo_size + ring_pad],
                    outline=_ACCENT_LIME,
                    width=2,
                )
                img.paste(logo, (logo_x, logo_y), mask)
                logo_loaded = True
            except Exception:
                logo_loaded = False

        if not logo_loaded:
            # Fallback graphic badge
            cx, cy = _WIN_W // 2, 66
            draw.ellipse([cx - 40, cy - 40, cx + 40, cy + 40], outline=_ACCENT_LIME, width=2, fill="#141a18")

        # 5. Fonts setup with system fallbacks
        def _get_font(name: str, size: int, bold: bool = False):
            font_file = "segoeuib.ttf" if bold else "segoeui.ttf"
            paths = [
                Path("C:/Windows/Fonts") / font_file,
                Path("/System/Library/Fonts") / "Helvetica.ttc",
                Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
            ]
            for p in paths:
                if p.is_file():
                    try:
                        return ImageFont.truetype(str(p), size)
                    except Exception:
                        pass
            return ImageFont.load_default()

        f_title = _get_font("Segoe UI", 22, bold=True)
        f_badge = _get_font("Segoe UI", 9, bold=True)
        f_sub   = _get_font("Segoe UI", 10, bold=False)
        f_foot  = _get_font("Segoe UI", 9, bold=False)

        # 6. Title and Version Pill Badge
        title_str = "KuroRelay"
        badge_str = f"v{self._version}"

        try:
            t_box = f_title.getbbox(title_str)
            t_w = t_box[2] - t_box[0]
            b_box = f_badge.getbbox(badge_str)
            b_w = b_box[2] - b_box[0]
        except Exception:
            t_w, b_w = 110, 36

        gap = 10
        badge_pad_x = 7
        badge_total_w = b_w + (badge_pad_x * 2)
        total_header_w = t_w + gap + badge_total_w
        start_x = (_WIN_W - total_header_w) // 2

        # Draw Title
        title_y = 138
        draw.text((start_x, title_y), title_str, fill=_TX_MAIN, font=f_title)

        # Draw Pill Badge
        bx1 = start_x + t_w + gap
        by1 = title_y + 4
        bx2 = bx1 + badge_total_w
        by2 = by1 + 20
        draw.rounded_rectangle([bx1, by1, bx2, by2], radius=10, fill=_ACCENT_DIM, outline=_ACCENT_LIME, width=1)
        draw.text((bx1 + badge_pad_x, by1 + 3), badge_str, fill=_ACCENT_LIME, font=f_badge)

        # 7. Subtitle / Tagline
        sub_str = "NEXT-GEN API WORKFLOW ENGINE & RUNTIME"
        try:
            s_box = f_sub.getbbox(sub_str)
            s_w = s_box[2] - s_box[0]
        except Exception:
            s_w = 260
        draw.text(((_WIN_W - s_w) // 2, 174), sub_str, fill=_TX_SUB, font=f_sub)

        # 8. Progress Bar Background Track
        draw.rounded_rectangle(
            [_BAR_X1, _BAR_Y, _BAR_X2, _BAR_Y + _BAR_H],
            radius=2,
            fill=_BAR_TRACK,
            outline=_BAR_BORDER,
            width=1,
        )

        # 9. Footer Info
        foot_str = f"KuroLabs Engine • v{self._version} • Ready"
        try:
            ft_box = f_foot.getbbox(foot_str)
            ft_w = ft_box[2] - ft_box[0]
        except Exception:
            ft_w = 220
        draw.text(((_WIN_W - ft_w) // 2, 312), foot_str, fill=_TX_FOOTER, font=f_foot)

        return img

    # ── Tkinter Loop ──────────────────────────────────────────────────────────

    def _run(self) -> None:
        try:
            import tkinter as tk
            from PIL import ImageTk

            self._root = tk.Tk()
            root = self._root
            root.withdraw()

            # Window configuration
            root.overrideredirect(True)
            root.configure(bg=_BG_COLOR)
            root.attributes("-topmost", True)
            root.resizable(False, False)

            # Accurate primary screen centering on Windows
            screen_w = 0
            screen_h = 0
            if sys.platform == "win32":
                try:
                    import ctypes
                    user32 = ctypes.windll.user32
                    screen_w = int(user32.GetSystemMetrics(0))
                    screen_h = int(user32.GetSystemMetrics(1))
                except Exception:
                    pass

            if not screen_w or not screen_h:
                root.update_idletasks()
                screen_w = root.winfo_screenwidth()
                screen_h = root.winfo_screenheight()

            pos_x = max(0, (screen_w - _WIN_W) // 2)
            pos_y = max(0, (screen_h - _WIN_H) // 2)
            root.geometry(f"{_WIN_W}x{_WIN_H}+{pos_x}+{pos_y}")

            # Canvas for graphics & dynamic elements
            self._canvas = tk.Canvas(
                root,
                width=_WIN_W,
                height=_WIN_H,
                bg=_BG_COLOR,
                highlightthickness=0,
                bd=0,
            )
            self._canvas.pack(fill="both", expand=True)

            # Generate and draw background artwork
            card_img = self._render_card_image()
            self._bg_photo = ImageTk.PhotoImage(card_img)
            self._canvas.create_image(0, 0, image=self._bg_photo, anchor="nw")

            # Dynamic Status Text (left aligned above progress bar)
            self._status_item = self._canvas.create_text(
                _BAR_X1,
                _BAR_Y - 14,
                text="Starting up…",
                fill=_TX_STATUS,
                font=("Segoe UI", 9),
                anchor="w",
            )

            # Dynamic Percentage Text (right aligned above progress bar)
            self._pct_item = self._canvas.create_text(
                _BAR_X2,
                _BAR_Y - 14,
                text="0%",
                fill=_ACCENT_LIME,
                font=("Segoe UI", 9, "bold"),
                anchor="e",
            )

            # Dynamic Animated Progress Line
            self._bar_item = self._canvas.create_line(
                _BAR_X1,
                _BAR_Y + (_BAR_H // 2),
                _BAR_X1,
                _BAR_Y + (_BAR_H // 2),
                fill=_ACCENT_LIME,
                width=_BAR_H,
                capstyle="round",
            )

            # Reveal centered window
            root.deiconify()
            self._ready.set()
            root.mainloop()

        except Exception as exc:
            self._ready.set()
            print(f"[KuroSplash] Init error: {exc}", file=sys.stderr)

    # ── Smooth Animation Internals ────────────────────────────────────

    def _start_progress_animation(self) -> None:
        if not self._animating:
            self._animating = True
            self._step_progress()

    def _step_progress(self) -> None:
        if not self._root or not self._canvas or self._closed:
            self._animating = False
            return

        diff = self._target_pct - self._current_pct
        if abs(diff) < 0.5:
            self._current_pct = self._target_pct
        else:
            self._current_pct += diff * 0.25

        # Update progress bar line
        track_w = _BAR_X2 - _BAR_X1
        current_x = _BAR_X1 + int(track_w * (self._current_pct / 100.0))
        bar_y_center = _BAR_Y + (_BAR_H // 2)

        if current_x > _BAR_X1:
            self._canvas.coords(self._bar_item, _BAR_X1, bar_y_center, current_x, bar_y_center)
        else:
            self._canvas.coords(self._bar_item, _BAR_X1, bar_y_center, _BAR_X1, bar_y_center)

        # Update percentage readout
        pct_display = f"{int(round(self._current_pct))}%"
        self._canvas.itemconfigure(self._pct_item, text=pct_display)

        if abs(self._target_pct - self._current_pct) >= 0.5:
            self._root.after(16, self._step_progress)
        else:
            self._animating = False

    def _fade_out(self) -> None:
        """Fade out alpha smoothly to zero, then destroy root."""
        if not self._root:
            return
        try:
            alpha = self._root.attributes("-alpha")
        except Exception:
            self._root.destroy()
            return

        if alpha > 0.08:
            try:
                self._root.attributes("-alpha", alpha - 0.12)
                self._root.after(16, self._fade_out)
            except Exception:
                self._root.destroy()
        else:
            self._root.destroy()
