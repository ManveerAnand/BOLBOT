"""Builds the README animations: docs/assets/demo-desktop.svg and docs/assets/demo-mobile.svg.

Plain SVG with CSS keyframes, so GitHub plays them in the README with no video or GIF.
Every name in them is made up. Run: python scripts/make-demo.py
"""
from pathlib import Path
from xml.sax.saxutils import escape

LOOP = 26.0  # seconds
FONT = "Segoe UI, -apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif"
C = dict(
    band="#1E1530", band_text="#F4F1FF", rail="#121118", side="#19181F", chat="#212027",
    line="#2C2B34", text="#E6E4EE", muted="#9A97A8", input="#2B2A33", active="#2E2D38",
    mint="#3DDC97", coral="#FF6B57", link="#8FC2FF", sam="#FFC857", mia="#8FC2FF", emre="#FF6B57",
)

# The story, in seconds. Both layouts use the same beats.
CAPTIONS = [
    (0.0, 5.8, "1", "Create a room"),
    (6.0, 10.8, "2", "Turn on your squad's languages"),
    (11.0, 16.8, "3", "Post the language picker"),
    (17.0, 25.5, "4", "Everyone chats in their own language"),
]
TYPE_ROOM = ("/translator room-create  name: general", 0.6, 2.2, 2.6)
TYPE_TR = ("/translator language-enable  language: Türkçe", 6.3, 7.6, 7.9)
TYPE_ZH = ("/translator language-enable  language: 中文", 8.6, 9.6, 9.9)
TYPE_WELCOME = ("/translator welcome", 11.2, 11.9, 12.2)


class Svg:
    def __init__(self, w, h):
        self.w, self.h, self.css, self.body, self.n = w, h, [], [], 0

    def keyframes(self, keys):
        """keys: [(seconds, 'css; css')]. Returns a class that plays them on the shared loop."""
        self.n += 1
        name = f"k{self.n}"
        keys = sorted(keys)
        if keys[0][0] > 0:
            keys.insert(0, (0, keys[0][1]))
        if keys[-1][0] < LOOP:
            keys.append((LOOP, keys[-1][1]))
        steps = " ".join(f"{t / LOOP * 100:.3f}%{{{css}}}" for t, css in keys)
        self.css.append(f"@keyframes {name}{{{steps}}}.{name}{{animation:{name} {LOOP}s linear infinite}}")
        return name

    def shown(self, spans, dy=6, fade=0.3):
        """Visible during each (on, off) span, rising in by dy pixels."""
        hidden, visible = f"opacity:0;transform:translateY({dy}px)", "opacity:1;transform:translateY(0)"
        keys = [(0, hidden)]
        for on, off in spans:
            keys += [(max(on, 0.001), hidden), (on + fade, visible), (off, visible), (off + fade, hidden)]
        return self.keyframes(keys)

    def add(self, s):
        self.body.append(s)

    def group(self, cls, inner):
        self.add(f'<g class="{cls}">{inner}</g>')

    def save(self, path):
        style = "".join(self.css)
        svg = (
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {self.w} {self.h}" width="{self.w}" '
            f'height="{self.h}" role="img" aria-label="BOLBOT setup and live translation demo">'
            f"<style>text{{font-family:{FONT}}}{style}"
            ".pulse{transform-box:fill-box;transform-origin:center}</style>"
            f"{LOGO}{''.join(self.body)}</svg>"
        )
        Path(path).write_text(svg, encoding="utf-8", newline="\n")


LOGO = (
    '<defs><symbol id="logo" viewBox="0 0 256 256"><rect width="256" height="256" rx="58" fill="#1E1530"/>'
    '<path d="M74 54h86a28 28 0 0 1 28 28v38a28 28 0 0 1-28 28H96l-34 26 6-26a28 28 0 0 1-22-27V82a28 28 0 0 1 28-28z" fill="#3DDC97"/>'
    '<path d="M64 120 82 72l18 48M71 103h22" fill="none" stroke="#1E1530" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>'
    '<path d="M114 104h70a28 28 0 0 1 28 28v36a28 28 0 0 1-22 27l6 27-34-26h-48a28 28 0 0 1-28-28v-36a28 28 0 0 1 28-28z" fill="#FF6B57" stroke="#1E1530" stroke-width="10" stroke-linejoin="round" paint-order="stroke"/>'
    '<path d="M156 117v7M130 132h52M142 140c6 18 18 32 36 42M170 140c-6 18-18 32-36 42" fill="none" stroke="#1E1530" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/>'
    "</symbol></defs>"
)


def t(x, y, s, size=15, fill=C["text"], weight=400, anchor="start"):
    return (f'<text x="{x}" y="{y}" font-size="{size}" fill="{fill}" font-weight="{weight}" '
            f'text-anchor="{anchor}">{escape(s)}</text>')


def avatar(x, y, letter, color, r=18):
    return (f'<circle cx="{x + r}" cy="{y + r}" r="{r}" fill="{color}"/>'
            + t(x + r, y + r + 6, letter, 16, C["band"], 700, "middle"))


def bot_avatar(x, y, size=36):
    return f'<use href="#logo" x="{x}" y="{y}" width="{size}" height="{size}"/>'


def badge(x, y):
    return (f'<rect x="{x}" y="{y - 13}" width="34" height="17" rx="4" fill="{C["mint"]}"/>'
            + t(x + 17, y, "APP", 11, C["band"], 700, "middle"))


def message(x, y, name, color, lines, bot=False, letter=None, used=None):
    """A chat message. Returns (svg, height)."""
    out, top = [], y
    if used:
        out.append(t(x + 48, y + 2, used, 12, C["muted"]))
        y += 18
    out.append(bot_avatar(x, y) if bot else avatar(x, y, letter or name[0], color))
    out.append(t(x + 48, y + 14, name, 15, color, 600))
    if bot:
        out.append(badge(x + 54 + len(name) * 8.6, y + 14))
    for i, line in enumerate(lines):
        out.append(t(x + 48, y + 36 + i * 21, line))
    return "".join(out), y - top + 36 + len(lines) * 21


def typing(svg, x, y, w, text, t0, t1, t_send, bg, size=15):
    """Text typed into an input: a cover in the input's colour slides right to reveal it."""
    width = len(text) * size * 0.56 + 24
    svg.group(svg.shown([(t0, t_send)], dy=0, fade=0.05), t(x, y, text, size))
    # Hidden outside its own window, so it never covers another command's text.
    cover = svg.keyframes([(0, "opacity:0;transform:translateX(0)"), (t0 - 0.02, "opacity:0;transform:translateX(0)"),
                           (t0, "opacity:1;transform:translateX(0)"), (t1, f"opacity:1;transform:translateX({width:.0f}px)"),
                           (t_send, f"opacity:1;transform:translateX({width:.0f}px)"),
                           (t_send + 0.02, "opacity:0;transform:translateX(0)")])
    svg.add(f'<g class="{cover}"><rect x="{x - 2}" y="{y - size - 4}" width="{w - (x - 2)}" height="{size + 12}" fill="{bg}"/>'
            f'<rect x="{x - 2}" y="{y - size}" width="2" height="{size + 4}" fill="{C["mint"]}"/></g>')


def placeholder(svg, x, y, label, typed_spans):
    """The input's grey hint, hidden while someone types."""
    spans, start = [], 0.0
    for t0, t_send in typed_spans:
        spans.append((start, t0 - 0.05))
        start = t_send + 0.1
    spans.append((start, LOOP - 0.4))
    svg.group(svg.shown(spans, dy=0, fade=0.05), t(x, y, label, 15, C["muted"]))


def caption_band(svg, w, h, size=20):
    svg.add(f'<rect width="{w}" height="{h}" fill="{C["band"]}"/>')
    for on, off, number, label in CAPTIONS:
        cls = svg.shown([(on, off)], dy=4)
        svg.group(cls, f'<circle cx="{w / 2 - len(label) * size * 0.27 - 24}" cy="{h / 2}" r="13" fill="{C["mint"]}"/>'
                  + t(w / 2 - len(label) * size * 0.27 - 24, h / 2 + 5, number, 14, C["band"], 700, "middle")
                  + t(w / 2 + 6, h / 2 + 7, label, size, C["band_text"], 600, "middle"))


def slash_replies(svg, x, y):
    """The bot's answers to the room and language commands."""
    room, h = message(x, y, "BOLBOT", C["mint"], ["Created room general. Each language gets its own",
                                                    "channel under translator-general."], bot=True,
                      used="Sam used /translator room-create")
    svg.group(svg.shown([(2.9, 5.8)]), room)
    tr, h1 = message(x, y, "BOLBOT", C["mint"], ["Türkçe is on. #general-tr is ready."], bot=True,
                     used="Sam used /translator language-enable")
    svg.group(svg.shown([(8.1, 10.8)]), tr)
    zh, _ = message(x, y + h1 + 14, "BOLBOT", C["mint"], ["中文 is on. #general-zh is ready."], bot=True,
                    used="Sam used /translator language-enable")
    svg.group(svg.shown([(10.1, 10.8)]), zh)


def channel(x, y, name, highlight=False, w=212):
    bg = f'<rect x="{x - 8}" y="{y - 20}" width="{w}" height="30" rx="6" fill="{C["active"]}"/>' if highlight else ""
    return bg + t(x, y, "#", 17, C["muted"]) + t(x + 18, y, name, 15, C["text"] if highlight else C["muted"])


def sidebar_translator(svg, x, y):
    """The category and channels the bot creates, appearing as each command runs."""
    svg.group(svg.shown([(3.2, 25.6)]), t(x - 4, y, "translator-general", 13, C["muted"], 600))
    for i, (name, on) in enumerate([("general-en", 3.4), ("general-tr", 8.4), ("general-zh", 10.3)]):
        svg.group(svg.shown([(on, 25.6)], dy=0), f'<g transform="translate(0 {i * 34})">'
                  f'<rect class="pulse {svg.keyframes([(0, "opacity:0"), (on, "opacity:.9"), (on + 1.2, "opacity:0")])}" '
                  f'x="{x - 8}" y="{y + 14}" width="212" height="30" rx="6" fill="{C["mint"]}" opacity="0"/>'
                  f'{channel(x, y + 34, name)}</g>')


def welcome_card(svg, x, y, w, buttons, columns, tap):
    """The language picker the bot posts. `tap` is the index of the button that gets picked."""
    head, h = message(x, y, "BOLBOT", C["mint"], [], bot=True, used="Sam used /translator welcome")
    box_y = y + h - 6
    rows = (len(buttons) + columns - 1) // columns
    box_h = 92 + rows * 46
    card = [head, f'<rect x="{x + 48}" y="{box_y}" width="{w}" height="{box_h}" rx="8" fill="#1A1920"/>',
            f'<rect x="{x + 48}" y="{box_y}" width="4" height="{box_h}" rx="2" fill="{C["mint"]}"/>',
            t(x + 66, box_y + 30, "Pick your language", 16, C["text"], 700),
            t(x + 66, box_y + 54, "You'll see your own channel, in your language.", 14, C["muted"])]
    bw = (w - 32 - (columns - 1) * 10) / columns
    spots = []
    for i, label in enumerate(buttons):
        bx = x + 66 + (i % columns) * (bw + 10)
        by = box_y + 72 + (i // columns) * 46
        spots.append((bx + bw / 2, by + 18))
        card.append(f'<rect x="{bx}" y="{by}" width="{bw}" height="36" rx="6" fill="{C["input"]}"/>'
                    + t(bx + bw / 2, by + 23, label, 14, C["text"], 600, "middle"))
        if i == tap:
            card.append(f'<g class="{svg.shown([(14.2, 16.8)], dy=0, fade=0.1)}">'
                        f'<rect x="{bx}" y="{by}" width="{bw}" height="36" rx="6" fill="{C["mint"]}"/>'
                        + t(bx + bw / 2, by + 23, label, 14, C["band"], 700, "middle") + "</g>")
    svg.group(svg.shown([(12.4, 16.8)]), "".join(card))
    note_y = box_y + box_h + 30
    svg.group(svg.shown([(14.5, 16.8)]),
              t(x + 48, note_y, "Only you can see this", 12, C["muted"])
              + t(x + 48, note_y + 22, "You're in! Your channel is #general-tr.", 15, C["text"]))
    return spots[tap]


def tap_ripple(svg, cx, cy):
    ring = svg.keyframes([(0, "opacity:0;transform:scale(.3)"), (14.2, "opacity:0;transform:scale(.3)"),
                          (14.25, "opacity:.7;transform:scale(.3)"), (14.8, "opacity:0;transform:scale(1.6)")])
    svg.add(f'<circle class="pulse {ring}" cx="{cx}" cy="{cy}" r="22" fill="none" stroke="{C["mint"]}" stroke-width="3"/>')


def typing_dots(x, y, name):
    return t(x, y, f"{name} is typing…", 13, C["muted"], 600)


# ---------------------------------------------------------------- desktop and web
def desktop(path):
    W, H, BAND = 1200, 760, 60
    s = Svg(W, H)
    caption_band(s, W, BAND, 21)
    top = BAND
    s.add(f'<rect x="0" y="{top}" width="{W}" height="{H - top}" fill="{C["chat"]}"/>'
          f'<rect x="0" y="{top}" width="68" height="{H - top}" fill="{C["rail"]}"/>'
          f'<rect x="68" y="{top}" width="236" height="{H - top}" fill="{C["side"]}"/>')
    # server rail: made-up servers, no real icons
    s.add(f'<rect x="12" y="{top + 14}" width="44" height="44" rx="14" fill="#3B2A57"/>'
          + t(34, top + 42, "SN", 15, C["band_text"], 700, "middle")
          + "".join(f'<circle cx="34" cy="{top + 92 + i * 56}" r="22" fill="{c}"/>'
                    for i, c in enumerate(["#2A3B4F", "#3F2A35", "#2A4537"])))
    s.add(t(86, top + 36, "Squad Night", 16, C["text"], 700)
          + f'<rect x="68" y="{top + 56}" width="236" height="1" fill="{C["line"]}"/>')
    s.add(channel(96, top + 92, "general", highlight=True) + channel(96, top + 126, "clips") + channel(96, top + 160, "lfg")
          + t(92, top + 202, "voice", 13, C["muted"], 600) + t(96, top + 232, "Lobby", 15, C["muted"]))
    sidebar_translator(s, 96, top + 274)
    # chat header, history and input
    s.add(t(330, top + 36, "#", 20, C["muted"]) + t(352, top + 36, "general", 16, C["text"], 700)
          + f'<rect x="304" y="{top + 56}" width="{W - 304}" height="1" fill="{C["line"]}"/>')
    first, h = message(330, top + 80, "Mia", C["mia"], ["gg everyone. Who's on tonight?"])
    s.add(first)
    slash_replies(s, 330, top + 80 + h + 22)
    spot = welcome_card(s, 330, top + 80 + h + 22, 560, ["English", "Türkçe", "中文"], 3, tap=1)
    s.add(f'<rect x="324" y="{H - 64}" width="{W - 348}" height="46" rx="10" fill="{C["input"]}"/>')
    typed = [TYPE_ROOM, TYPE_TR, TYPE_ZH, TYPE_WELCOME]
    placeholder(s, 344, H - 35, "Message #general", [(a, c) for _, a, _, c in typed])
    for text, a, b, c in typed:
        typing(s, 344, H - 35, W - 30, text, a, b, c, C["input"])
    # pointer: comes in, clicks Türkçe, leaves
    cx, cy = spot
    move = s.keyframes([(0, "opacity:0;transform:translate(1060px,620px)"), (12.7, "opacity:0;transform:translate(1060px,620px)"),
                        (13.0, "opacity:1;transform:translate(1060px,620px)"), (13.9, f"opacity:1;transform:translate({cx}px,{cy}px)"),
                        (15.4, f"opacity:1;transform:translate({cx}px,{cy}px)"), (15.8, f"opacity:0;transform:translate({cx + 40}px,{cy + 40}px)")])
    tap_ripple(s, cx, cy)
    s.add(f'<g class="{move}"><path d="M0 0 0 22 6 16 10 26 14 24 10 15 18 15Z" fill="#fff" stroke="{C["band"]}" stroke-width="1.5"/></g>')
    # scene 4: the two channels side by side
    d = []
    d.append(f'<rect x="304" y="{top}" width="{W - 304}" height="{H - top}" fill="{C["chat"]}"/>'
             f'<rect x="{304 + (W - 304) / 2}" y="{top}" width="1" height="{H - top}" fill="{C["line"]}"/>')
    halves = [(330, "general-tr", "What Emre's Turkish friends read"), (330 + (W - 304) / 2, "general-en", "What the English speakers read")]
    for x, name, note in halves:
        d.append(t(x, top + 36, "#", 20, C["muted"]) + t(x + 22, top + 36, name, 16, C["text"], 700)
                 + t(x, top + 84, note, 13, C["muted"]))
    d.append(f'<rect x="304" y="{top + 56}" width="{W - 304}" height="1" fill="{C["line"]}"/>')
    s.group(s.shown([(17.0, 25.5)], dy=0), "".join(d))
    lx, rx, my = halves[0][0], halves[1][0], top + 110
    s.group(s.shown([(17.4, 18.1)], dy=0, fade=0.1), typing_dots(lx, H - 40, "Emre"))
    s.group(s.shown([(18.2, 25.5)]), message(lx, my, "Emre", C["emre"], ["Bu akşam ranked oynayan var mı?"])[0])
    s.group(s.shown([(19.2, 25.5)]), message(rx, my, "Emre", C["emre"], ["Anyone playing ranked tonight?"])[0])
    s.group(s.shown([(20.2, 20.9)], dy=0, fade=0.1), typing_dots(rx, H - 40, "Mia"))
    s.group(s.shown([(21.0, 25.5)]), message(rx, my + 84, "Mia", C["mia"], ["Count me in, starting in 10!"])[0])
    s.group(s.shown([(22.0, 25.5)]), message(lx, my + 84, "Mia", C["mia"], ["Ben de varım, 10 dakikaya başlıyorum!"])[0])
    s.group(s.shown([(22.6, 25.5)], dy=0),
            t(W / 2 + 152, H - 40, "Same names, same replies. BOLBOT does the translating.", 15, C["mint"], 600, "middle"))
    s.save(path)


# ---------------------------------------------------------------- phone app
def mobile(path):
    W, H, BAND = 390, 844, 74
    s = Svg(W, H)
    caption_band(s, W, BAND, 15)
    top = BAND
    s.add(f'<rect x="0" y="{top}" width="{W}" height="{H - top}" fill="{C["chat"]}"/>')

    def header(name, extra=""):
        return (f'<rect x="0" y="{top}" width="{W}" height="56" fill="{C["chat"]}"/>'
                f'<path d="M18 {top + 21}h20M18 {top + 28}h20M18 {top + 35}h20" stroke="{C["text"]}" stroke-width="2.4" stroke-linecap="round"/>'
                + t(54, top + 35, "#", 19, C["muted"]) + t(74, top + 35, name, 16, C["text"], 700) + extra
                + f'<rect x="0" y="{top + 56}" width="{W}" height="1" fill="{C["line"]}"/>')

    s.add(header("general"))
    first, h = message(14, top + 76, "Mia", C["mia"], ["gg everyone. Who's on?"])
    s.add(first)
    y0 = top + 76 + h + 20
    room, rh = message(14, y0, "BOLBOT", C["mint"], ["Created room general.", "Each language gets its own", "channel."], bot=True,
                       used="Sam used /translator room-create")
    s.group(s.shown([(2.9, 5.8)]), room)
    tr, trh = message(14, y0, "BOLBOT", C["mint"], ["Türkçe is on.", "#general-tr is ready."], bot=True,
                      used="Sam used /translator language-enable")
    s.group(s.shown([(8.1, 10.8)]), tr)
    zh, _ = message(14, y0 + trh + 12, "BOLBOT", C["mint"], ["中文 is on.", "#general-zh is ready."], bot=True,
                    used="Sam used /translator language-enable")
    s.group(s.shown([(10.1, 10.8)]), zh)
    spot = welcome_card(s, 14, y0, W - 76, ["English", "Türkçe", "中文"], 1, tap=1)
    tap_ripple(s, *spot)
    finger = s.keyframes([(0, "opacity:0"), (13.8, "opacity:0"), (14.0, "opacity:.85"), (14.5, "opacity:.85"), (14.8, "opacity:0")])
    s.add(f'<circle class="{finger}" cx="{spot[0]}" cy="{spot[1]}" r="16" fill="#ffffff"/>')
    # input bar
    s.add(f'<rect x="12" y="{H - 62}" width="{W - 24}" height="46" rx="23" fill="{C["input"]}"/>')
    typed = [(txt.replace("  ", " "), a, b, c) for txt, a, b, c in [TYPE_ROOM, TYPE_TR, TYPE_ZH, TYPE_WELCOME]]
    placeholder(s, 30, H - 33, "Message #general", [(a, c) for _, a, _, c in typed])
    for text, a, b, c in typed:
        # long commands scroll, so show the end of them
        shown = text if len(text) <= 34 else "…" + text[-33:]
        typing(s, 30, H - 33, W - 18, shown, a, b, c, C["input"], 14)
    # channel drawer slides in when the bot adds channels
    drawer = s.keyframes([(0, "transform:translateX(-310px)"), (3.2, "transform:translateX(-310px)"), (3.6, "transform:translateX(0)"),
                          (5.4, "transform:translateX(0)"), (5.8, "transform:translateX(-310px)"), (8.2, "transform:translateX(-310px)"),
                          (8.6, "transform:translateX(0)"), (10.6, "transform:translateX(0)"), (11.0, "transform:translateX(-310px)")])
    shade = s.keyframes([(0, "opacity:0"), (3.2, "opacity:0"), (3.6, "opacity:.55"), (5.4, "opacity:.55"), (5.8, "opacity:0"),
                         (8.2, "opacity:0"), (8.6, "opacity:.55"), (10.6, "opacity:.55"), (11.0, "opacity:0")])
    s.add(f'<rect class="{shade}" x="0" y="{top}" width="{W}" height="{H - top}" fill="#000"/>')
    s.body.append(f'<g class="{drawer}">')
    s.add(f'<rect x="0" y="{top}" width="300" height="{H - top}" fill="{C["side"]}"/>'
          + t(20, top + 38, "Squad Night", 17, C["text"], 700)
          + f'<rect x="0" y="{top + 58}" width="300" height="1" fill="{C["line"]}"/>'
          + channel(28, top + 96, "general", True, 260) + channel(28, top + 130, "clips") + channel(28, top + 164, "lfg"))
    sidebar_translator(s, 28, top + 210)
    s.body.append("</g>")

    # scene 4: Emre's Turkish channel, then Mia's English one, then back
    def screen(span, name, msgs, note):
        inner = [header(name), f'<rect x="0" y="{top + 57}" width="{W}" height="{H - top - 57}" fill="{C["chat"]}"/>',
                 t(14, top + 84, note, 13, C["muted"])]
        s.group(s.shown([span], dy=0, fade=0.25), "".join(inner))
        for on, off, x, y, who, color, lines in msgs:
            s.group(s.shown([(on, off)]), message(x, y, who, color, lines)[0])

    my = top + 104
    screen((17.0, 20.6), "general-tr", [(18.2, 20.6, 14, my, "Emre", C["emre"], ["Bu akşam ranked oynayan var mı?"])],
           "Emre writes in Turkish")
    s.group(s.shown([(17.4, 18.1)], dy=0, fade=0.1), typing_dots(24, H - 80, "Emre"))
    screen((20.6, 23.0), "general-en", [(20.7, 23.0, 14, my, "Emre", C["emre"], ["Anyone playing ranked tonight?"]),
                                        (21.6, 23.0, 14, my + 80, "Mia", C["mia"], ["Count me in, starting in 10!"])],
           "Mia reads it in English and replies")
    screen((23.0, 25.5), "general-tr", [(23.0, 25.5, 14, my, "Emre", C["emre"], ["Bu akşam ranked oynayan var mı?"]),
                                        (23.5, 25.5, 14, my + 80, "Mia", C["mia"], ["Ben de varım, 10 dakikaya", "başlıyorum!"])],
           "Emre gets Mia's reply in Turkish")
    s.save(path)


if __name__ == "__main__":
    assets = Path(__file__).resolve().parent.parent / "docs" / "assets"
    desktop(assets / "demo-desktop.svg")
    mobile(assets / "demo-mobile.svg")
    print("wrote", assets / "demo-desktop.svg", "and", assets / "demo-mobile.svg")
