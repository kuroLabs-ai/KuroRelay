#!/usr/bin/env python3
"""Automated build script for KuroRelay desktop application.

Supports building:
1. Standalone single-file executable (`dist/onefile/KuroRelay.exe` and `dist/KuroRelay.exe`).
2. Modular directory bundle (`dist/onefolder/KuroRelay/`).
3. Both targets in a single unified workflow (default).

Usage:
    python scripts/build_exe.py                  # Builds both onefile and onefolder
    python scripts/build_exe.py --mode onefile   # Builds only onefile executable
    python scripts/build_exe.py --mode onefolder # Builds only onefolder directory
    python scripts/build_exe.py --skip-frontend  # Skip compiling React frontend
"""

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path

from PIL import Image

ROOT_DIR = Path(__file__).resolve().parent.parent
DIST_DIR = ROOT_DIR / "dist"
BUILD_DIR = ROOT_DIR / "build"
FRONTEND_DIR = ROOT_DIR / "frontend"
ASSETS_DIR = ROOT_DIR / "assets" / "icons"

DIST_ONEFILE_DIR = DIST_DIR / "onefile"
DIST_ONEFOLDER_DIR = DIST_DIR / "onefolder"


def ensure_app_icon() -> Path:
    """Generate multi-resolution app.ico from KuroRelay brand logo."""
    src_icon = ASSETS_DIR / "logo.png"
    if not src_icon.exists():
        src_icon = FRONTEND_DIR / "public" / "logo.png"

    ico_path = ASSETS_DIR / "app.ico"
    ASSETS_DIR.mkdir(parents=True, exist_ok=True)
    print(f"[1/4] Generating application icon from {src_icon.name}...")

    with Image.open(src_icon) as img:
        img = img.convert("RGBA")
        w, h = img.size
        side = max(w, h)
        square = Image.new("RGBA", (side, side), (0, 0, 0, 0))
        square.paste(img, ((side - w) // 2, (side - h) // 2))

        sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
        square.save(ico_path, format="ICO", sizes=sizes)

    print(f"      Created: {ico_path} ({ico_path.stat().st_size:,} bytes)")
    return ico_path


def build_frontend():
    """Compile React 19 / TypeScript / Vite frontend into frontend/dist."""
    print("[2/4] Compiling React frontend...")
    npm_cmd = "npm.cmd" if sys.platform == "win32" else "npm"

    # Verify npm is installed
    if not shutil.which(npm_cmd):
        raise RuntimeError(f"Could not find '{npm_cmd}'. Please install Node.js and npm.")

    res = subprocess.run(
        [npm_cmd, "--prefix", str(FRONTEND_DIR), "run", "build"],
        check=False,
        cwd=ROOT_DIR,
        shell=(sys.platform == "win32"),
    )
    if res.returncode != 0:
        raise RuntimeError("Frontend build failed. Please check TypeScript and Vite errors above.")

    index_html = FRONTEND_DIR / "dist" / "index.html"
    if not index_html.exists():
        raise FileNotFoundError(f"Expected build output not found: {index_html}")

    print("      Frontend build complete (frontend/dist ready).")


def build_executable(mode: str = "both"):
    """Run PyInstaller with kurorelay.spec for the specified mode."""
    print(f"[3/4] Running PyInstaller packaging (mode: {mode})...")
    spec_file = ROOT_DIR / "scripts" / "kurorelay.spec"

    env = os.environ.copy()
    env["KURORELAY_BUILD_MODE"] = mode

    cmd = [
        sys.executable,
        "-m",
        "PyInstaller",
        "--noconfirm",
        "--clean",
        str(spec_file),
    ]

    res = subprocess.run(cmd, check=False, cwd=ROOT_DIR, env=env)
    if res.returncode != 0:
        raise RuntimeError(f"PyInstaller build failed for mode '{mode}'.")

    # Organize outputs into standard layout
    organize_distribution(mode)


def organize_distribution(mode: str):
    """Normalize output paths so both dist/onefile and dist/onefolder are available."""
    DIST_DIR.mkdir(parents=True, exist_ok=True)
    DIST_ONEFILE_DIR.mkdir(parents=True, exist_ok=True)

    exe_suffix = ".exe" if sys.platform == "win32" else ""

    # 1. Handle OneFile output
    if mode in ("both", "onefile"):
        src_onefile = DIST_DIR / f"KuroRelay_OneFile{exe_suffix}"
        target_onefile = DIST_ONEFILE_DIR / f"KuroRelay{exe_suffix}"
        root_onefile = DIST_DIR / f"KuroRelay{exe_suffix}"

        if src_onefile.exists():
            shutil.copy2(src_onefile, target_onefile)
            shutil.copy2(src_onefile, root_onefile)
            src_onefile.unlink(missing_ok=True)
        elif root_onefile.exists() and not target_onefile.exists():
            shutil.copy2(root_onefile, target_onefile)

    # 2. Handle OneFolder output
    if mode in ("both", "onefolder"):
        src_folder = DIST_DIR / "KuroRelay"
        if src_folder.exists() and src_folder.is_dir():
            if DIST_ONEFOLDER_DIR.exists():
                shutil.rmtree(DIST_ONEFOLDER_DIR)
            shutil.copytree(src_folder, DIST_ONEFOLDER_DIR)


def verify_build(mode: str = "both"):
    """Verify built executables and directories."""
    print("[4/4] Verifying distribution bundle...")
    exe_suffix = ".exe" if sys.platform == "win32" else ""

    onefile_exe = DIST_ONEFILE_DIR / f"KuroRelay{exe_suffix}"
    if not onefile_exe.exists():
        onefile_exe = DIST_DIR / f"KuroRelay{exe_suffix}"

    onefolder_dir = DIST_ONEFOLDER_DIR if DIST_ONEFOLDER_DIR.exists() else (DIST_DIR / "KuroRelay")
    onefolder_exe = onefolder_dir / f"KuroRelay{exe_suffix}"

    print("\n" + "=" * 65)
    print(" KURORELAY BUILD VERIFICATION SUMMARY")
    print("=" * 65)

    if mode in ("both", "onefile"):
        if onefile_exe.exists():
            size_mb = onefile_exe.stat().st_size / (1024 * 1024)
            print("[✓] OneFile Executable:")
            print(f"    Path: {onefile_exe}")
            print(f"    Size: {size_mb:.2f} MB")
        else:
            raise FileNotFoundError(f"Expected OneFile executable not found at: {onefile_exe}")

    if mode in ("both", "onefolder"):
        if onefolder_exe.exists():
            total_size = sum(f.stat().st_size for f in onefolder_dir.rglob("*") if f.is_file())
            file_count = sum(1 for f in onefolder_dir.rglob("*") if f.is_file())
            print("[✓] OneFolder Package (Modular Directory / Fast Startup):")
            print(f"    Directory: {onefolder_dir}")
            print(f"    Binary:    {onefolder_exe}")
            print(f"    Files:     {file_count} files ({total_size / (1024 * 1024):.2f} MB)")
        else:
            raise FileNotFoundError(f"Expected OneFolder binary not found at: {onefolder_exe}")

    print("=" * 65 + "\n")


def parse_args():
    parser = argparse.ArgumentParser(description="KuroRelay Application Packaging Script")
    parser.add_argument(
        "--mode",
        choices=["both", "onefile", "onefolder"],
        default="both",
        help="Build target format: 'onefile' (single .exe), 'onefolder' (directory bundle), or 'both' (default)",
    )
    parser.add_argument(
        "--skip-frontend",
        action="store_true",
        help="Skip recompiling the React frontend if already up to date",
    )
    return parser.parse_args()


def main():
    args = parse_args()
    try:
        ensure_app_icon()
        if not args.skip_frontend:
            build_frontend()
        build_executable(mode=args.mode)
        verify_build(mode=args.mode)
    except (OSError, RuntimeError, subprocess.SubprocessError, ValueError) as exc:
        print(f"\nERROR: Build failed: {exc}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
