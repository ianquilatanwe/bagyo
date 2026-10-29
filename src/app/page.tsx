import { Storm } from "@/components/Storm";

// Six screens. Section i is centred at scroll progress i / 5; the heading names the signal the
// gauge shows at that point (kept in step by src/lib/storm.check.ts).
const beats = [
  { kicker: "Signal No. 2", title: "It starts as rain you stop noticing.", body: "Wind 62 to 88 km/h. Branches down, roofs rattle." },
  { kicker: "Signal No. 4", title: "Then the wind picks a direction.", body: "Wind 118 to 184 km/h. And so does everything not tied down." },
  { kicker: "Signal No. 5", title: "Hold on.", body: "Wind 185 km/h and up. The sky turns green and the world goes sideways." },
];

export default function Home() {
  return (
    <>
      <div aria-hidden className="loader fixed inset-0 z-50 grid place-items-center bg-[#141b22] text-foam">
        <div className="flex flex-col items-center gap-4">
          <svg viewBox="0 0 32 32" width="56" height="56" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <circle cx="16" cy="16" r="4.5" />
            <path d="M16 11.5C16 6 21 3.5 26.5 4.5M16 20.5C16 26 11 28.5 5.5 27.5" />
          </svg>
          <p className="text-xs uppercase tracking-[0.4em] text-foam/80">Tracking Bagyo</p>
        </div>
      </div>
      <Storm />
      <main>
        <section className="grid min-h-svh place-items-center px-4 text-center">
          <div className="beat over-storm">
            <p className="text-xs uppercase tracking-[0.4em] text-foam/80">Signal No. 1 · a storm in five signals</p>
            <h1 className="font-display text-[clamp(6rem,24vw,20rem)] font-black uppercase leading-[0.8] tracking-tight">
              Bagyo
            </h1>
            <p className="mt-6 text-sm text-foam/80">Scroll into it. Move to stir it. Click, or hold, to call the lightning.</p>
          </div>
        </section>

        {beats.map((b) => (
          <section key={b.kicker} className="flex min-h-svh items-center px-4 sm:px-12 lg:px-24">
            <div className="beat over-storm max-w-2xl">
              <p className="text-xs uppercase tracking-[0.4em] text-foam/80">{b.kicker}</p>
              <h2 className="mt-3 font-display text-[clamp(3rem,9vw,7.5rem)] font-black uppercase leading-[0.85]">
                {b.title}
              </h2>
              <p className="mt-5 max-w-md text-sm leading-relaxed text-foam/85">{b.body}</p>
            </div>
          </section>
        ))}

        <section className="grid min-h-svh place-items-center px-4 text-center text-ink">
          <div className="beat in-eye max-w-2xl">
            <p className="text-xs uppercase tracking-[0.4em]">The eye</p>
            <h2 className="mt-3 font-display text-[clamp(3rem,9vw,7.5rem)] font-black uppercase leading-[0.85]">
              Then, for a moment, nothing.
            </h2>
            <p className="mx-auto mt-5 max-w-md text-sm leading-relaxed">
              Blue sky, warm light, no wind. Birds get caught in here too: tap the sky. The other half of
              the storm is still coming.
            </p>
          </div>
        </section>
      </main>

      <footer className="grid min-h-svh place-items-center px-4 text-center text-ink">
          <div className="beat in-eye max-w-md">
            <p className="font-display text-4xl font-black uppercase">Bagyo</p>
            <p className="mt-3 text-sm leading-relaxed">
              A scroll-driven WebGL study by Ian Quilatan. One fragment shader, no 3D models, no video.
            </p>
            <a
              href="#top"
              className="mt-6 inline-block rounded-full bg-ink px-5 py-3 text-sm text-foam transition-colors hover:bg-ink/80"
            >
              Back into the storm ↑
            </a>
          </div>
        </footer>
    </>
  );
}
