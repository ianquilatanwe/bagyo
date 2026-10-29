# Bagyo

A scroll-driven WebGL study: scroll up into a typhoon. Rain bands and a turning cloud spiral build
through the five PAGASA wind signals, then the eye opens onto clear sky. Everything you see in the
storm is drawn by one fragment shader. There are no 3D models, video or images.

Built with Next.js 15, TypeScript and Tailwind CSS 4, plus Lenis (about 4 kB) for smooth scrolling.
No 3D or animation libraries.

## What you can do

| Input | During the storm | In the eye |
| --- | --- | --- |
| Scroll | Wind builds from Signal 1 to 5; scrolling fast whips up a gust | The eye opens; the wind drops |
| Move the pointer | The umbrella leans into the wind; rain leaves a dry patch under it and runs off its edges; fast moves stir the clouds; a hard flick at Signal 4+ turns it inside out | The umbrella folds; the sun leans towards it |
| Click / tap | Lightning strikes that spot | Birds fly up from that spot |
| Hold, then release | A charged strike: wider, with a fork | |
| Phone: drag | The umbrella follows your finger, just above it; up-and-down drags still scroll | The same, folded |
| Phone: hold still, then drag | The same, but the page stops scrolling until you let go | |

## How it works, in plain words

- **The storm is maths, not pictures.** `src/lib/shader.ts` is a small program the graphics card
  runs for every pixel, every frame. It gets a handful of numbers from the page: how far you
  have scrolled, where the pointer is, the strikes in progress. From those it works out the colour of each pixel.
- **One loop feeds it.** `src/components/Storm.tsx` reads scroll and pointer, eases towards them,
  and passes them to the shader, the umbrella and the wind gauge 60 times a second.
- **The numbers are real.** `src/lib/storm.ts` turns scroll progress into wind speed and wind speed
  into PAGASA's signal thresholds. `npm run check` makes sure each section's heading names the same
  signal the gauge shows there.
- **Lightning behaves like lightning.** A dim leader steps down from the cloud, the bright return
  stroke fires when it lands, two weaker re-strikes follow down the same channel, and it fades
  through a violet afterglow. You can click as fast as you like; up to four bolts share the sky.
- **Exact on phone GPUs.** The shader's random numbers use integer maths and the cloud spin angle is
  kept within one turn, because phone GPUs round large or tiny float values differently from desktops
  (that showed as blocky clouds). The bolt is drawn by distance across it, so steep zigzags stay solid.
- **The umbrella really blocks the rain.** The near rain is particles (`src/lib/rain.ts`): drops that
  hit the canopy stop and splash, their water runs to the rim and drips off, and the wind carries the
  drips onto the rain's slant. The shader only draws the distant rain behind.
- **Wind carries the rain, it doesn't bend it.** The distant rain drifts sideways on its own clock,
  so a change of wind (scrolling) changes where drops go next without sliding the ones already falling.
- **Smooth scrolling.** Lenis lets the wheel glide on and settle. The page still scrolls for real, so
  CSS scroll animations and the back-to-top link work; phones keep their own momentum.

## Sound

On by default. Browsers only allow audio after you click, tap or press a key (scrolling does not
count), so it starts on your first click anywhere; until then the **Sound** button (top right) says
"Click for sound", and it turns sound off and on after that. Everything is generated in code with the Web Audio API
(`src/lib/sound.ts`), so there are no audio files:

- **Rain:** a stereo hiss bed plus thousands of individual droplet ticks; a heavier texture takes over
  as the wind rises. It follows the same amount as the rain on screen, so it fades to silence as the
  eye opens and stays silent to the end.
- **Wind:** a low body, a howl whose pitch drifts, and a whistle in gusts (scroll fast).
- **Umbrella:** drops tap the fabric where the umbrella is; in heavy rain the taps blur into a drumming
  roar, and the open rain sounds a little duller underneath it.
- **Thunder:** three kinds (crack-boom, roller, deep boom), panned to where the strike lands, with a
  reverb tail; close strikes add a low thump, the background lightning gives distant, wetter thunder.
- **Birds:** short trilled chirps when they take off in the eye.

A compressor and a limiter keep stacked thunder from clipping. It pauses while the tab is hidden.

## Accessibility and safety

- All text is real HTML (headings, paragraphs), readable by screen readers and search engines.
- **Reduced motion:** the storm stops moving on its own, there is no lightning, and the text
  doesn't animate. Scrolling still changes the scene.
- **Flash limit:** full-screen flashes are capped at one per 0.4 s, under the WCAG limit of three
  per second. Only the thin bolt itself flickers.
- **No WebGL:** a still CSS gradient replaces the storm; the page still reads top to bottom.
- Text selection is off: the page is a scene, and clicking strikes lightning.

## Run it

```bash
npm install
npm run dev      # http://localhost:3000
npm run check    # gauge/heading consistency
npm run build
```

Social image: `src/app/opengraph-image.jpg`, captured from the running site with
`portfolio/catalog-video/tmp/typhoon/og.mjs`.

By Ian Joseph Quilatan.
