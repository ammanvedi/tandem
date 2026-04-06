"use client";

import { useRef, useState, useEffect } from "react";

interface MarqueeTextProps {
  text: string;
  className?: string;
}

export function MarqueeText({ text, className = "" }: MarqueeTextProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    const textEl = textRef.current;
    if (!container || !textEl) return;

    const check = () => {
      setIsOverflowing(textEl.scrollWidth > container.clientWidth);
    };

    check();
    const observer = new ResizeObserver(check);
    observer.observe(container);
    return () => observer.disconnect();
  }, [text]);

  return (
    <div ref={containerRef} className={`overflow-hidden ${className}`}>
      {isOverflowing ? (
        <div className="animate-marquee whitespace-nowrap inline-flex gap-8">
          <span>{text}</span>
          <span>{text}</span>
        </div>
      ) : (
        <span ref={textRef} className="whitespace-nowrap">
          {text}
        </span>
      )}
    </div>
  );
}
