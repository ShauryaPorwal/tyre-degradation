"use client";

export function RaceBackground() {
  return (
    <div className="race-background" aria-hidden="true">
      <div className="race-background__glow race-background__glow--red" />
      <div className="race-background__glow race-background__glow--blue" />

      <div className="race-background__grid" />

      <div className="race-background__track race-background__track--one" />
      <div className="race-background__track race-background__track--two" />
      <div className="race-background__track race-background__track--three" />

      <div className="race-background__kerbs race-background__kerbs--left" />
      <div className="race-background__kerbs race-background__kerbs--right" />

      <div className="race-background__scanlines" />

      <style jsx global>{`
        .race-background {
          position: fixed;
          inset: 0;
          z-index: -1;
          overflow: hidden;
          pointer-events: none;
          background:
            radial-gradient(
              circle at 75% 20%,
              rgba(30, 90, 130, 0.14),
              transparent 35%
            ),
            linear-gradient(135deg, #08090c 0%, #0e1015 50%, #08090c 100%);
        }

        .race-background__grid {
          position: absolute;
          inset: -50%;
          opacity: 0.2;
          transform: perspective(650px) rotateX(62deg) translateY(18%);
          transform-origin: center bottom;
          background-image:
            linear-gradient(rgba(61, 150, 190, 0.22) 1px, transparent 1px),
            linear-gradient(
              90deg,
              rgba(61, 150, 190, 0.22) 1px,
              transparent 1px
            );
          background-size: 70px 70px;
          animation: f1-grid-move 5s linear infinite;
        }

        .race-background__glow {
          position: absolute;
          width: 45vw;
          height: 45vw;
          border-radius: 50%;
          filter: blur(90px);
          opacity: 0.12;
        }

        .race-background__glow--red {
          top: 20%;
          right: -15%;
          background: #e10600;
        }

        .race-background__glow--blue {
          bottom: -20%;
          left: -15%;
          background: #087ea4;
        }

        .race-background__track {
          position: absolute;
          left: -10%;
          width: 120%;
          height: 1px;
          background: linear-gradient(
            90deg,
            transparent,
            rgba(255, 255, 255, 0.12),
            rgba(0, 190, 255, 0.7),
            rgba(255, 255, 255, 0.12),
            transparent
          );
          box-shadow: 0 0 12px rgba(0, 190, 255, 0.35);
          animation: f1-speed-line 2.8s linear infinite;
        }

        .race-background__track--one {
          top: 32%;
        }

        .race-background__track--two {
          top: 54%;
          animation-delay: 0.9s;
          opacity: 0.55;
        }

        .race-background__track--three {
          top: 76%;
          animation-delay: 1.7s;
          opacity: 0.35;
        }

        .race-background__kerbs {
          position: absolute;
          width: 150px;
          height: 14px;
          opacity: 0.22;
          background: repeating-linear-gradient(
            135deg,
            #e10600 0 18px,
            #e10600 18px 36px,
            #eeeeee 36px 54px,
            #eeeeee 54px 72px
          );
          box-shadow: 0 0 18px rgba(225, 6, 0, 0.35);
          animation: f1-kerb-slide 3s linear infinite;
        }

        .race-background__kerbs--left {
          top: 42%;
          left: -80px;
          transform: rotate(-12deg);
        }

        .race-background__kerbs--right {
          top: 68%;
          right: -80px;
          transform: rotate(12deg);
          animation-delay: 1.4s;
        }

        .race-background__scanlines {
          position: absolute;
          inset: 0;
          opacity: 0.04;
          background: repeating-linear-gradient(
            0deg,
            transparent 0 3px,
            rgba(255, 255, 255, 0.7) 4px
          );
        }

        @keyframes f1-grid-move {
          from {
            background-position: 0 0, 0 0;
          }

          to {
            background-position: 0 140px, 140px 0;
          }
        }

        @keyframes f1-speed-line {
          from {
            transform: translateX(-15%);
            opacity: 0;
          }

          20% {
            opacity: 0.8;
          }

          80% {
            opacity: 0.8;
          }

          to {
            transform: translateX(15%);
            opacity: 0;
          }
        }

        @keyframes f1-kerb-slide {
          from {
            transform: translateX(-60px) rotate(-12deg);
          }

          to {
            transform: translateX(60px) rotate(-12deg);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .race-background *,
          .race-background {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  );
}