#!/usr/bin/env python3
"""Builds the complete Inno Setup installer for KuroRelay.

Features:
- Packages both OneFile standalone executable and OneFolder directory bundle into the installer.
- Gives the end-user the choice of which format to install via Inno Setup components:
    1. Standard (recommended): Fast launch, modular directory bundle.
    2. Portable: Single executable file.
- Generates branded installer artwork with KuroRelay Obsidian & Lime neon styling.
- Sets up Desktop, Start Menu shortcuts, and Windows App Paths registration.

Usage:
    python scripts/build_installer.py              # Verifies/builds both formats and builds installer
    python scripts/build_installer.py --rebuild    # Forces rebuild of both executable formats
    python scripts/build_installer.py --skip-build # Skips executable build, compiles .iss only
"""

import argparse
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT_DIR = Path(__file__).resolve().parent.parent
SCRIPTS_DIR = ROOT_DIR / "scripts"
DIST_DIR = ROOT_DIR / "dist"
INSTALLER_DIR = DIST_DIR / "installer"
INSTALLER_ASSETS_DIR = DIST_DIR / "installer-assets"
ISS_PATH = SCRIPTS_DIR / "kurorelay_setup.iss"


def read_app_version() -> str:
    """Read numeric application version from pyproject.toml."""
    pyproject_text = (ROOT_DIR / "pyproject.toml").read_text(encoding="utf-8")
    match = re.search(r'(?m)^version\s*=\s*"(\d+\.\d+\.\d+)"\s*$', pyproject_text)
    if match is None:
        raise ValueError("pyproject.toml must define a numeric MAJOR.MINOR.PATCH version.")
    return match.group(1)


APP_VERSION = read_app_version()


def find_iscc() -> Path:
    """Locate Inno Setup compiler executable (ISCC.exe)."""
    which_path = shutil.which("ISCC") or shutil.which("ISCC.exe")
    if which_path:
        return Path(which_path)

    candidates = [
        Path(r"C:\Program Files\Inno Setup 7\ISCC.exe"),
        Path(r"C:\Program Files (x86)\Inno Setup 7\ISCC.exe"),
        Path(r"C:\Program Files\Inno Setup 6\ISCC.exe"),
        Path(r"C:\Program Files (x86)\Inno Setup 6\ISCC.exe"),
        Path(os.environ.get("LOCALAPPDATA", "")) / "Programs" / "Inno Setup 7" / "ISCC.exe",
        Path(os.environ.get("LOCALAPPDATA", "")) / "Programs" / "Inno Setup 6" / "ISCC.exe",
    ]

    for cand in candidates:
        if cand.is_file():
            return cand

    raise FileNotFoundError(
        "Inno Setup Compiler (ISCC.exe) not found.\n"
        "Please install Inno Setup 6 or 7 from https://jrsoftware.org/isdl.php "
        "and ensure it is added to your PATH or installed in Program Files."
    )


def verify_executable_bundles(dist_dir: Path = DIST_DIR) -> tuple[Path, Path]:
    """Validate that both one-file and one-folder builds exist."""
    onefile_exe = dist_dir / "onefile" / "KuroRelay.exe"
    if not onefile_exe.is_file():
        onefile_exe = dist_dir / "KuroRelay.exe"

    onefolder_exe = dist_dir / "onefolder" / "KuroRelay.exe"
    if not onefolder_exe.is_file():
        onefolder_exe = dist_dir / "onefolder" / "KuroRelay" / "KuroRelay.exe"
    if not onefolder_exe.is_file():
        onefolder_exe = dist_dir / "KuroRelay" / "KuroRelay.exe"

    missing = []
    if not onefile_exe.is_file():
        missing.append(dist_dir / "onefile" / "KuroRelay.exe")
    if not onefolder_exe.is_file():
        missing.append(dist_dir / "onefolder" / "KuroRelay.exe")

    if missing:
        paths = "\n".join(f"  - {path}" for path in missing)
        raise FileNotFoundError(
            "Required application bundles are missing. Build both targets first:\n" + paths
        )
    return onefile_exe, onefolder_exe


def ensure_executable_bundles(force_rebuild: bool = False) -> tuple[Path, Path]:
    """Ensure both normalized OneFile and OneFolder distributions are built."""
    try:
        bundles = verify_executable_bundles()
    except FileNotFoundError:
        bundles = None

    if force_rebuild or bundles is None:
        print("[1/2] Building application packages (both OneFile & OneFolder)...")
        build_exe_script = SCRIPTS_DIR / "build_exe.py"
        cmd = [sys.executable, str(build_exe_script), "--mode", "both"]
        res = subprocess.run(cmd, check=False, cwd=ROOT_DIR)
        if res.returncode != 0:
            raise RuntimeError("Executable build failed during installer preparation.")
        bundles = verify_executable_bundles()
    else:
        print("[1/2] Application packages verified:")
        print(f"      - OneFile:   {bundles[0]}")
        print(f"      - OneFolder: {bundles[1].parent}")
    return bundles


def ensure_installer_artwork(output_dir: Path = INSTALLER_ASSETS_DIR) -> tuple[Path, Path]:
    """Create branded Inno Setup wizard bitmaps matching KuroRelay Obsidian & Lime neon."""
    output_dir.mkdir(parents=True, exist_ok=True)
    banner_path = output_dir / "kurorelay-wizard.bmp"
    small_path = output_dir / "kurorelay-wizard-small.bmp"
    icon_path = ROOT_DIR / "assets" / "icons" / "logo.png"
    v_logo_path = ROOT_DIR / "assets" / "icons" / "kurorelay_combined_vertical.png"

    if not icon_path.is_file():
        icon_path = ROOT_DIR / "frontend" / "public" / "logo.png"
    if not v_logo_path.is_file():
        v_logo_path = icon_path
    if not icon_path.is_file():
        raise FileNotFoundError(f"Required installer branding asset is missing: {icon_path}")

    def make_background(size: tuple[int, int]) -> Image.Image:
        width, height = size
        background = Image.new("RGB", size)
        pixels = background.load()
        for y in range(height):
            vertical = y / max(1, height - 1)
            for x in range(width):
                horizontal = x / max(1, width - 1)
                pixels[x, y] = (
                    int(12 + 4 * vertical),
                    int(14 + 4 * vertical),
                    int(18 + 6 * vertical + 4 * horizontal),
                )

        # Ambient neon lime & emerald glow
        glow = Image.new("RGBA", size, (0, 0, 0, 0))
        draw_glow = ImageDraw.Draw(glow)
        draw_glow.ellipse(
            (-width * 0.4, height * 0.1, width * 1.1, height * 0.75),
            fill=(184, 255, 52, 50),
        )
        draw_glow.ellipse(
            (width * 0.2, height * 0.3, width * 1.2, height * 0.85),
            fill=(110, 231, 183, 40),
        )
        glow = glow.filter(ImageFilter.GaussianBlur(max(6, width // 8)))
        return Image.alpha_composite(background.convert("RGBA"), glow)

    def alpha_crop(path: Path) -> Image.Image:
        image = Image.open(path).convert("RGBA")
        bounds = image.getchannel("A").getbbox()
        if bounds is None:
            raise ValueError(f"Branding image contains no visible pixels: {path}")
        return image.crop(bounds)

    # 1. Wizard Banner (164 x 314) — uses vertical combined logo (text underneath)
    banner = make_background((164, 314))
    v_logo = alpha_crop(v_logo_path)
    v_logo.thumbnail((144, 180), Image.Resampling.LANCZOS)
    banner.alpha_composite(v_logo, ((164 - v_logo.width) // 2, 55))

    # Lime accent divider line
    draw = ImageDraw.Draw(banner)
    line_y = 55 + v_logo.height + 18
    for index in range(70):
        ratio = index / 69
        color = (int(184 * (1 - ratio * 0.3)), int(255 - 24 * ratio), int(52 + 130 * ratio), 220)
        draw.line((47 + index, line_y, 47 + index, line_y + 2), fill=color)

    banner.convert("RGB").save(banner_path, format="BMP")

    # 2. Wizard Small Icon (55 x 55) — uses cropped brand icon
    small = make_background((55, 55))
    small_icon = alpha_crop(icon_path)
    small_icon.thumbnail((42, 42), Image.Resampling.LANCZOS)
    small.alpha_composite(
        small_icon,
        ((55 - small_icon.width) // 2, (55 - small_icon.height) // 2),
    )
    small.convert("RGB").save(small_path, format="BMP")

    print(f"      Installer artwork generated at: {output_dir}")
    return banner_path, small_path


def compile_inno_setup(iscc_path: Path) -> Path:
    """Compile Inno Setup script."""
    print(f"[2/2] Compiling Inno Setup installer via: {iscc_path}...")
    INSTALLER_DIR.mkdir(parents=True, exist_ok=True)

    cmd = [str(iscc_path), f"/DMyAppVersion={APP_VERSION}", str(ISS_PATH)]
    res = subprocess.run(cmd, check=False, cwd=SCRIPTS_DIR)
    if res.returncode != 0:
        raise RuntimeError("Inno Setup compilation failed.")

    expected_installer = INSTALLER_DIR / f"KuroRelay-Setup-v{APP_VERSION}-x64.exe"
    if not expected_installer.is_file():
        raise FileNotFoundError(f"Expected setup installer not found: {expected_installer}")

    size_mb = expected_installer.stat().st_size / (1024 * 1024)
    print("\n" + "=" * 65)
    print(" SUCCESS: KuroRelay Installer Ready!")
    print("=" * 65)
    print(f"  Installer:  {expected_installer}")
    print(f"  Size:       {size_mb:.2f} MB")
    print("  Modes:      Choice of 'Standard Folder' or 'Portable OneFile' in wizard")
    print("  Shortcuts:  KuroRelay on Desktop & Start Menu")
    print("=" * 65 + "\n")
    return expected_installer


def parse_args():
    parser = argparse.ArgumentParser(description="Build Inno Setup installer for KuroRelay")
    parser.add_argument(
        "--rebuild",
        action="store_true",
        help="Force rebuilding both OneFile and OneFolder distributions before running Inno Setup",
    )
    parser.add_argument(
        "--skip-build",
        action="store_true",
        help="Skip executable builds and compile existing dist/onefile and dist/onefolder bundles",
    )
    return parser.parse_args()


def main():
    args = parse_args()
    try:
        iscc = find_iscc()
        if not args.skip_build:
            ensure_executable_bundles(force_rebuild=args.rebuild)
        else:
            verify_executable_bundles()
        ensure_installer_artwork()
        compile_inno_setup(iscc)
    except (FileNotFoundError, OSError, RuntimeError, subprocess.SubprocessError, ValueError) as exc:
        print(f"\nERROR: Installer creation failed: {exc}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
