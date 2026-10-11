"""Build DotDash and install it into BeamNG as an unpacked mod.

    python build.py                     build + install into your user folder
    python build.py --public --zip      the release: dist/dotdash.zip, no private fonts
    python build.py --no-install        build only

The game wants one app.js per app, so for each app the pieces are joined:

    font faces  +  src/numfont.js  +  src/streams.js  +  the renderer
    (src/widgets.js, or src/dash.js for the combined card)  +  src/apps.js

Fonts: the public build ships none - it uses Overpass and Overpass Mono,
which come with BeamNG itself. Font files you put in fonts/ (see FONTS below)
are embedded only in your own private build; don't share that one.
"""

import base64
import json
import os
import shutil
import sys
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
APP = "DotDash"
MOD = "dotdash"
USER = os.path.join(os.environ["LOCALAPPDATA"], "BeamNG", "BeamNG.drive", "current")
FONTS = [("NType82 Headline", "NType82-Headline.woff2", "woff2"),
         ("NType82 Mono", "NType82Mono-Regular.woff2", "woff2"),
         ("NDot 55", "NDot-55.otf", "opentype")]

# name, directive, class, streams, size (w, h), interactive, description
APPS = [
    ("DotDash", "dotDash", "DotDash", "base+g", (560, 215), False,
     "Everything on one card: rpm glyph row with shift light, speed, gear, G meter, pedals, temperatures, 0-100."),
    ("DotTacho", "dotTacho", "DotTacho", "base", (300, 300), False,
     "Rpm and speed in one round gauge, with gear, turn signals, water, fuel and warning lights."),
    ("DotBoost", "dotBoost", "DotBoost", "base+boost", (190, 190), False,
     "Turbo pressure in your chosen unit, vacuum to boost, with a peak hold."),
    ("DotStartStop", "dotStartStop", "DotStartStop", "base", (290, 200), True,
     "Engine start / stop with the drivetrain controls on a half circle to its right: diff locks, low / high range, 2WD / 4WD, hubs, ESC, drive modes, N2O."),
    ("DotGMeter", "dotGMeter", "DotGMeter", "base+g", (190, 190), False,
     "Lateral and longitudinal G with a trail and the peak."),
    ("DotPedals", "dotPedals", "DotPedals", "base", (220, 200), False,
     "Clutch, brake, throttle and handbrake as solid bars, 0-100%. Brake flickers with ABS, throttle with TCS."),
    ("DotPedalsClear", "dotPedalsClear", "DotPedalsClear", "base", (200, 190), False,
     "The pedal bars with no background - straight over the game - and the % at the top inside each bar."),
    ("DotRpm", "dotRpm", "DotRpm", "base", (460, 56), False,
     "The rpm as a row of glyph dots with a shift light, and the rpm in dot digits."),
    ("DotGearRing", "dotGearRing", "DotGearRing", "base", (120, 120), False,
     "The gear in a circle with the revs round it - the middle of DotDash on its own."),
    ("DotGear", "dotGear", "DotGear", "base", (90, 90), False,
     "Just the gear, in a box: R, N, 1, 2, 3... Flashes red at the shift point."),
    ("DotGears", "dotGears", "DotGears", "base", (340, 80), False,
     "Every gear on one row (R N 1-6 for manuals, P R N D for automatics), the current one lit, the next one red at the limit."),
    ("DotInfo", "dotInfo", "DotInfo", "base", (260, 120), False,
     "Water, oil and fuel."),
    ("DotTimer", "dotTimer", "DotTimer", "base", (260, 120), False,
     "0-100 and 0-200 km/h, arming itself at a standstill; session best in red."),
]
STREAMS = {"base": ["electrics", "engineInfo"], "g": ["sensors"], "boost": ["forcedInductionInfo"]}


def kebab(name):
    return "".join("-" + ch.lower() if ch.isupper() else ch for ch in name).lstrip("-")


def app_json(name, directive, size, interactive, desc):
    w, h = size
    return {
        "domElement": f"<{kebab(directive)}></{kebab(directive)}>",
        "name": name,
        "types": ["ui.apps.categories.vehicle_info"],
        "description": desc,
        "css": {"left": "20px", "top": "120px", "width": f"{w}px", "height": f"{h}px",
                "min-width": f"{max(60, w // 2)}px", "min-height": f"{max(60, h // 2)}px"},
        "author": "Tudor077",
        "version": "1.0.2",
        "directive": directive,
        "category": "Dashboard",
        "isAuxiliary": False,
        "interactive": "yes" if interactive else "no",
    }


# BeamNG's own UI fonts, used by the public build: nothing to ship, nothing
# to license - they are already in every copy of the game.
GAME_FONTS = [("DD Mono", "/ui/ui-vue/src/assets/fonts/OverpassMono/static/OverpassMono-Regular.ttf", "truetype"),
              ("DD Head", "/ui/ui-vue/src/assets/fonts/Overpass/static/Overpass-SemiBold.ttf", "truetype")]


def font_js(with_fonts):
    faces = [f'@font-face{{font-family:"{fam}";src:url({url}) format("{fmt}");}}' for fam, url, fmt in GAME_FONTS]
    for fam, file, fmt in FONTS:
        p = os.path.join(HERE, "fonts", file)
        if with_fonts and os.path.exists(p):
            b64 = base64.b64encode(open(p, "rb").read()).decode()
            mime = "font/woff2" if fmt == "woff2" else "font/otf"
            faces.append(f'@font-face{{font-family:"{fam}";src:url(data:{mime};base64,{b64}) format("{fmt}");}}')
    css = "".join(faces)
    return ("// font faces, added to the page once" + chr(10) + "(function(){if(document.getElementById('dotdash-fonts'))return;"
            "var s=document.createElement('style');s.id='dotdash-fonts';"
            f"s.textContent={json.dumps(css)};document.head.appendChild(s);}})();" + chr(10))


def icon(path, label):
    """The app list thumbnail, 300x144 like the stock ones: a dot row and the name."""
    from PIL import Image, ImageDraw, ImageFont
    W, H = 300, 144
    im = Image.new("RGB", (W, H), (0, 0, 0))
    d = ImageDraw.Draw(im)
    n = 20
    for i in range(n):
        x = 18 + i * ((W - 36) / n)
        col = (215, 25, 32) if i >= 16 else (255, 255, 255) if i < 12 else (40, 40, 40)
        d.rounded_rectangle((x, 18, x + 9, 25), radius=3, fill=col)
    try:
        f = ImageFont.truetype(os.path.join(HERE, "fonts", "NDot-55.otf"), 34)
    except OSError:
        f = ImageFont.truetype("consola.ttf", 30)
    d.text((W / 2, 84), label.replace("Dot", "").upper() or "DASH", font=f, fill=(255, 255, 255), anchor="mm")
    d.ellipse((W / 2 - 5, 118, W / 2 + 5, 128), fill=(215, 25, 32))
    im.save(path)


def build(with_fonts=True):
    root = os.path.join(HERE, "build", MOD)
    shutil.rmtree(root, ignore_errors=True)
    src = lambda n: open(os.path.join(HERE, "src", n), encoding="utf-8").read()
    fonts = font_js(with_fonts)
    for name, directive, cls, streams, size, interactive, desc in APPS:
        out = os.path.join(root, "ui", "modules", "apps", name)
        os.makedirs(out)
        lib = src("dash.js") if cls == "DotDash" else src("widgets.js")
        streams_list = [x for k in streams.split("+") for x in STREAMS[k]]
        reg = (f"dotApp({json.dumps(directive)}, {cls}, {json.dumps(streams_list)}"
               + (", { link: startStopLink, unlink: function (r, w) { if (w._unbind) w._unbind() } }" if interactive else "")
               + ")" + chr(10))
        js = chr(10).join([fonts, src("numfont.js"), src("streams.js"), lib, src("apps.js"), reg])
        open(os.path.join(out, "app.js"), "w", encoding="utf-8").write(js)
        json.dump(app_json(name, directive, size, interactive, desc),
                  open(os.path.join(out, "app.json"), "w", encoding="utf-8"), indent=2)
        icon(os.path.join(out, "app.png"), name)
        print(f"  {name:13s} {len(js) // 1024:4d} KB  streams {', '.join(streams_list)}")
    json.dump({"name": "DotDash", "author": "Tudor077", "version": "1.0.2",
               "description": "Dot-matrix dashboard UI apps: one combined card, or every gauge on its own."},
              open(os.path.join(root, "info.json"), "w", encoding="utf-8"), indent=2)
    print(f"built {len(APPS)} apps, private fonts {'in (private build)' if 'base64' in fonts else 'out (public build)'}")
    return root


def install(src):
    dst = os.path.join(USER, "mods", "unpacked", MOD)
    shutil.rmtree(dst, ignore_errors=True)
    shutil.copytree(src, dst)
    print("installed", dst)


def zip_mod(src):
    os.makedirs(os.path.join(HERE, "dist"), exist_ok=True)
    z = os.path.join(HERE, "dist", MOD + ".zip")
    with zipfile.ZipFile(z, "w", zipfile.ZIP_DEFLATED) as f:
        for base, _, files in os.walk(src):
            for n in files:
                p = os.path.join(base, n)
                f.write(p, os.path.relpath(p, src))
    print("zip", z)


if __name__ == "__main__":
    # --public: no private fonts, for the repo / BeamNG Repository release
    public = "--public" in sys.argv or "--no-fonts" in sys.argv
    src = build(with_fonts=not public)
    if "--no-install" not in sys.argv:
        install(src)
    if "--zip" in sys.argv:
        zip_mod(src)
