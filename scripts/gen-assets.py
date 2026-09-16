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


def pwa_icon(src: Path, size: int, scale: float, dest: Path) -> None:
    """The mark trimmed to its ink and centred on white at `scale` of the size.

    The artwork's canvas pads the mark unevenly, so it is cropped to the ink
    first rather than inheriting the offset. Maskable icons take a smaller
    scale: Android crops them to the launcher's shape, and only the centre
    circle of 80% is guaranteed to survive.
    """
    img = Image.open(src).convert("RGBA")
    img = img.crop(img.getchannel("A").getbbox())
    height = round(size * scale)
    width = round(img.width * height / img.height)
    img = img.resize((width, height), Image.LANCZOS)
    ground = Image.new("RGB", (size, size), (255, 255, 255))
    ground.paste(img, ((size - width) // 2, (size - height) // 2), mask=img.split()[3])
    ground.save(dest, optimize=True)
    print(f"{dest.relative_to(HERE)}  {size}px  {dest.stat().st_size // 1024}KB")


fit(FLUTTER / "icon" / "icon.png", 256, OUT / "logo-mark.png")
for name in ("restaurant", "pharmacy", "event"):
    fit(FLUTTER / f"{name}.png", 160, OUT / f"{name}.png")

on_white(FLUTTER / "icon" / "app_icon.png", 180, PUBLIC / "icons" / "apple-touch-icon.png")
on_white(FLUTTER / "icon" / "app_icon.png", 64, PUBLIC / "favicon.png")

# The install icons. These were once Flutter's template icons, copied in with
# the web folder, so a vendor who added the app to their home screen got the
# Flutter logo. Same orange mark as the launcher icon and the favicon.
for size in (192, 512):
    pwa_icon(FLUTTER / "icon" / "app_icon.png", size, 0.56, PUBLIC / "icons" / f"Icon-{size}.png")
    pwa_icon(FLUTTER / "icon" / "app_icon.png", size, 0.46, PUBLIC / "icons" / f"Icon-maskable-{size}.png")
