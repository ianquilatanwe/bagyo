# Bagyo

A scroll-driven WebGL study: scroll up into a typhoon. Rain bands and a turning cloud spiral build
through the five PAGASA wind signals, then the eye opens onto clear sky. Everything you see in the
storm is drawn by one fragment shader. There are no 3D models, video or images.

Built with Next.js 15, TypeScript and Tailwind CSS 4. No 3D or animation libraries.

## What you can do

| Input | During the storm | In the eye |
| --- | --- | --- |
| Scroll | Wind builds from Signal 1 to 5; scrolling fast whips up a gust | The eye opens; the wind drops |
| Move the pointer | The umbrella leans into the wind; rain leaves a dry patch under it and runs off its edges; fast moves stir the clouds; a hard flick at Signal 4+ turns it inside out | The umbrella folds; the sun leans towards it |
| Click / tap | Lightning strikes that spot | Birds fly up from that spot |
| Hold, then release | A charged strike: wider, with a fork | |

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
- **The umbrella's dry patch follows the rain.** The shader works out which points are downwind of
  the canopy along the current rain angle, so the shadow tilts as the wind picks up.

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

By Ian Quilatan.
