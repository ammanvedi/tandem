"use client";

import { useEffect, useRef } from "react";

interface DotMatrixWaveformProps {
  className?: string;
}

const DOT_COUNT = 10;
const DOT_SIZE = 3;
const DOT_GAP = 3;
const ROWS = 4;

export function DotMatrixWaveform({ className = "" }: DotMatrixWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = DOT_COUNT * (DOT_SIZE + DOT_GAP);
    const height = ROWS * (DOT_SIZE + DOT_GAP);
    canvas.width = width;
    canvas.height = height;

    const phases = Array.from({ length: DOT_COUNT }, () => Math.random() * Math.PI * 2);
    const speeds = Array.from({ length: DOT_COUNT }, () => 1.5 + Math.random() * 2.5);

    const animate = (time: number) => {
      ctx.clearRect(0, 0, width, height);
      const t = time / 1000;

      for (let col = 0; col < DOT_COUNT; col++) {
        const amplitude = (Math.sin(t * speeds[col] + phases[col]) + 1) / 2;
        const activeDots = Math.round(amplitude * ROWS);

        for (let row = 0; row < ROWS; row++) {
          const x = col * (DOT_SIZE + DOT_GAP);
          const y = (ROWS - 1 - row) * (DOT_SIZE + DOT_GAP);
          const isActive = row < activeDots;

          if (isActive) {
            const glowAlpha = 0.15 + amplitude * 0.25;
            ctx.shadowColor = `rgba(46, 158, 114, ${glowAlpha})`;
            ctx.shadowBlur = 4;
            ctx.fillStyle = `rgba(46, 158, 114, ${0.6 + amplitude * 0.4})`;
          } else {
            ctx.shadowColor = "transparent";
            ctx.shadowBlur = 0;
            ctx.fillStyle = "rgba(189, 186, 175, 0.1)";
          }

          ctx.beginPath();
          ctx.roundRect(x, y, DOT_SIZE, DOT_SIZE, 1);
          ctx.fill();
        }
      }

      animFrameRef.current = requestAnimationFrame(animate);
    };

    animFrameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, []);

  return (
    <div className={`flex items-center ${className}`}>
      <canvas
        ref={canvasRef}
        className="block"
        style={{
          width: DOT_COUNT * (DOT_SIZE + DOT_GAP),
          height: ROWS * (DOT_SIZE + DOT_GAP),
        }}
      />
    </div>
  );
}
