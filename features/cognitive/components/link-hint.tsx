"use client";

import { useState, useEffect } from "react";

interface LinkHintProps {
  text: string | null;
}

export function LinkHint({ text }: LinkHintProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!text) {
      setVisible(false);
      return;
    }
    setVisible(true);
    const timer = setTimeout(() => setVisible(false), 5000);
    return () => clearTimeout(timer);
  }, [text]);

  if (!text) return null;

  return (
    <p
      className="text-sm text-muted-foreground/60 text-center transition-opacity duration-700 ease-out px-8"
      style={{ opacity: visible ? 1 : 0 }}
    >
      {text}
    </p>
  );
}
