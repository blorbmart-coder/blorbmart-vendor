"""
Renders the web-sized images from the Flutter app's source artwork.

The originals are 4500px (the logo) and 512px (the business-type art). The
largest the web app ever draws the logo is 64 CSS px and the art 52 CSS px,
so shipping the originals would cost a vendor ~450KB on campus data for
pixels no screen shows. Run once after the artwork changes:

    python scripts/gen-assets.py
"""
from pathlib import Path
from PIL import Image

HERE = Path(__file__).resolve().parent.parent
FLUTTER = HERE.parent / "blorb_vendor" / "assets"
OUT = HERE / "src" / "assets"
PUBLIC = HERE / "public"


def fit(src: Path, size: int, dest: Path) -> None:
    img = Image.open(src).convert("RGBA")
    img.thumbnail((size, size), Image.LANCZOS)
    dest.parent.mkdir(parents=True, exist_ok=True)
    img.save(dest, optimize=True)
    print(f"{dest.relative_to(HERE)}  {img.size[0]}px  {dest.stat().st_size // 1024}KB")


def on_white(src: Path, size: int, dest: Path) -> None:
    img = Image.open(src).convert("RGBA")
    img.thumbnail((size, size), Image.LANCZOS)
    ground = Image.new("RGB", img.size, (255, 255, 255))
    ground.paste(img, mask=img.split()[3])
    ground.save(dest, optimize=True)
    print(f"{dest.relative_to(HERE)}  {img.size[0]}px  {dest.stat().st_size // 1024}KB")


fit(FLUTTER / "icon" / "icon.png", 256, OUT / "logo-mark.png")
for name in ("restaurant", "pharmacy", "event"):
    fit(FLUTTER / f"{name}.png", 160, OUT / f"{name}.png")

on_white(FLUTTER / "icon" / "app_icon.png", 180, PUBLIC / "icons" / "apple-touch-icon.png")
on_white(FLUTTER / "icon" / "app_icon.png", 64, PUBLIC / "favicon.png")
