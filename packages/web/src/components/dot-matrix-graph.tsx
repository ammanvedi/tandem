"use client";

import { useMemo } from "react";

interface DotMatrixGraphProps {
  values: number[];
  maxValue: number;
  rows?: number;
  cols?: number;
  className?: string;
}

export function DotMatrixGraph({
  values,
  maxValue,
  rows = 5,
  cols = 12,
  className = "",
}: DotMatrixGraphProps) {
  const normalizedCols = useMemo(() => {
    const result: number[] = [];
    for (let c = 0; c < cols; c++) {
      const idx = Math.floor((c / cols) * values.length);
      const val = values[idx] ?? 0;
      result.push(Math.min(val / maxValue, 1));
    }
    return result;
  }, [values, maxValue, cols]);

  return (
    <div
      className={`inline-grid gap-[2px] ${className}`}
      style={{
        gridTemplateColumns: `repeat(${cols}, 3px)`,
        gridTemplateRows: `repeat(${rows}, 3px)`,
      }}
    >
      {Array.from({ length: rows * cols }, (_, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const fillLevel = normalizedCols[col] ?? 0;
        const threshold = 1 - (row + 1) / rows;
        const isActive = fillLevel > threshold;
        const isHigh = fillLevel > 0.8;

        return (
          <div
            key={i}
            className={`rounded-[1px] transition-colors duration-300 ${
              isActive ? (isHigh ? "bg-red-500" : "bg-success") : "bg-muted-foreground/20"
            }`}
          />
        );
      })}
    </div>
  );
}
