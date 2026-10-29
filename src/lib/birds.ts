// Clicking inside the eye scares up a few birds (seabirds really do get trapped in typhoon eyes).
// Each bird is a small SVG "v" that flaps (CSS animation on the path) and flies out and up from the
// click with the Web Animations API, then removes itself.

const MAX_BIRDS = 36;

/** Returns how many birds took off (for the sound). */
export function releaseBirds(layer: HTMLElement, x: number, y: number) {
  const count = Math.min(5 + Math.floor(Math.random() * 3), MAX_BIRDS - layer.childElementCount);
  for (let i = 0; i < count; i++) {
    const bird = document.createElement("div");
    bird.className = "bird";
    bird.innerHTML = '<svg viewBox="-10 -6 20 10" width="30" height="15"><path d="M-9 0 Q-4.5 -5 0 0 Q4.5 -5 9 0" /></svg>';
    const path = bird.querySelector("path")!;
    path.style.animationDuration = `${0.28 + Math.random() * 0.12}s`;
    path.style.animationDelay = `${-Math.random()}s`;

    // Fly out on a fan of upward angles, with a little arc and some birds smaller (further away).
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
    const dist = 260 + Math.random() * 320;
    const dx = Math.cos(angle) * dist, dy = Math.sin(angle) * dist;
    const size = 0.6 + Math.random() * 0.7;
    const at = (t: number, s: number) =>
      `translate(${x + dx * t}px, ${y + dy * t - 60 * Math.sin(t * Math.PI)}px) scale(${size * s})`;

    layer.append(bird);
    bird
      .animate(
        [
          { transform: at(0, 0.3), opacity: 0 },
          { transform: at(0.15, 1), opacity: 1, offset: 0.12 },
          { transform: at(0.7, 0.8), opacity: 1, offset: 0.7 },
          { transform: at(1, 0.6), opacity: 0 },
        ],
        { duration: 2200 + Math.random() * 900, easing: "cubic-bezier(.2,.6,.3,1)" },
      )
      .finished.then(() => bird.remove());
  }
  return count;
}
