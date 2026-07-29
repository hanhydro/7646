# Black Cat Box

A mobile-friendly web game in the spirit of *Fruit Box* / フルーツボックス — but instead of
apples, the board is packed with 170 black cats, each wearing a number.

Drag a box around any group of cats whose numbers add up to **exactly 10** and they scamper
off. You have two minutes. Every cat you free is a point.

## Playing

Open `index.html`. The cattery is locked — the password is **`mickey`** (case-insensitive,
surrounding spaces ignored).

- **Drag** anywhere on the board to draw a selection box.
- A cat joins the box when its **centre** falls inside, so you can aim loosely.
- The running total floats above the box: amber while you're under 10, red once you've gone
  over, mint green the moment you hit exactly 10.
- Release on a green box and those cats leave. Release on anything else and nothing happens —
  there's no penalty for a miss, so drag freely.
- Clear the entire board and the round ends early with a *Purrfect!*

Your best score is remembered in `localStorage`, as is the sound setting and the fact that
you've already entered the password.

## Design notes

- **Everything is drawn in code.** No images, no fonts, no libraries, no network requests —
  the whole game is three files plus an icon. Each cat is painted onto a small offscreen
  canvas once per board size and then stamped 170 times per frame.
- **Numbers stay readable.** Each digit is drawn in its own colour with a dark outline, so
  the number is legible against black fur and doubles as a colour cue; the inner ears carry
  the same tint for players who pattern-match on colour rather than digits.
- **The board turns with the phone.** A wide screen gets 17 × 10; hold the phone upright and
  it becomes 10 × 17. Rotating mid-round transposes the board rather than rebuilding it, so
  your score, your clock, and every remaining cat carry over.
- **Touch first.** Pointer events with capture, `touch-action: none`, and a `touchmove`
  guard keep drags from turning into page scrolls or pull-to-refresh.
- **The clock is honest.** Switching tabs pauses it; coming back resumes where you left off.
- Sound is a handful of WebAudio oscillators — no audio files. It can be muted from the menu
  or the in-game HUD, and the choice sticks.
- `prefers-reduced-motion` turns off every animation.

## Files

| File | What it holds |
| --- | --- |
| `index.html` | The four screens: password gate, menu, game, results |
| `styles.css` | Night-alley palette, layout, screen transitions |
| `game.js` | Cat rendering, board model, selection, timer, gate |
| `icon.svg`, `manifest.json` | Add-to-home-screen support |

## Running it

It's a static site — no build step:

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

Opening `index.html` straight from the filesystem works too; only the web-app manifest needs
a real server.

## About the password

The `mickey` check is a client-side gate, exactly as asked — it keeps casual visitors out of
the game, but the password sits in `game.js` and anyone who views the source can read it.
It's a doorbell, not a lock; don't put anything behind it that actually needs protecting.
