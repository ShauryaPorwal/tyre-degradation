"use client";

/** Static, low-contrast pit-wall backdrop. It contains no animation. */
export function RaceBackground() {
  return (
    <div className="race-background" aria-hidden="true">
      <div className="race-background__glow race-background__glow--red" />
      <div className="race-background__glow race-background__glow--blue" />
      <div className="race-background__grid" />
      <div className="race-background__vignette" />

      <style jsx global>{`
        .race-background {
          position: fixed;
          inset: 0;
          z-index: -1;
          overflow: hidden;
          pointer-events: none;
          background:
            radial-gradient(circle at 50% 45%, rgba(24, 45, 55, 0.18), transparent 48%),
            linear-gradient(135deg, #08090c 0%, #0d1014 52%, #08090c 100%);
        }

        .race-background__grid {
          position: absolute;
          inset: -25%;
          opacity: 0.08;
          transform: perspective(700px) rotateX(62deg) translateY(16%);
          transform-origin: center bottom;
          background-image:
            linear-gradient(rgba(61, 150, 190, 0.3) 1px, transparent 1px),
            linear-gradient(90deg, rgba(61, 150, 190, 0.3) 1px, transparent 1px);
          background-size: 76px 76px;
        }

        .race-background__glow {
          position: absolute;
          width: 42vw;
          height: 42vw;
          border-radius: 50%;
          filter: blur(100px);
          opacity: 0.08;
        }

        .race-background__glow--red {
          top: 18%;
          right: -16%;
          background: #e10600;
        }

        .race-background__glow--blue {
          bottom: -18%;
          left: -16%;
          background: #087ea4;
        }

        .race-background__vignette {
          position: absolute;
          inset: 0;
          background: radial-gradient(
            ellipse at center,
            transparent 28%,
            rgba(0, 0, 0, 0.28) 72%,
            rgba(0, 0, 0, 0.58) 100%
          );
        }
      `}</style>
    </div>
  );
}
