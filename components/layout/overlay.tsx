"use client";

import React, { useEffect, useCallback, useRef, useState } from "react";

interface OverlayProps {
  isOpen: boolean;
  onClose: () => void;
  mode: "modal" | "sidebar";
  width?: string;
  title?: string;
  children: React.ReactNode;
}

export function Overlay({
  isOpen,
  onClose,
  mode,
  width,
  title,
  children,
}: OverlayProps) {
  const [mounted, setMounted] = useState(false);
  const [closing, setClosing] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const defaultWidth = mode === "modal" ? "620px" : "320px";
  const resolvedWidth = width ?? defaultWidth;

  const handleClose = useCallback(() => {
    setClosing(true);
    setTimeout(() => {
      setClosing(false);
      setMounted(false);
      onClose();
    }, 200);
  }, [onClose]);

  // Mount/unmount
  useEffect(() => {
    if (isOpen) {
      setMounted(true);
      setClosing(false);
    } else if (mounted) {
      handleClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Esc key
  useEffect(() => {
    if (!mounted) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mounted, handleClose]);

  if (!mounted) return null;

  const backdropAnimation = closing
    ? "overlay-backdrop-out 0.2s ease-out forwards"
    : "overlay-backdrop-in 0.2s ease-out forwards";

  const contentAnimation =
    mode === "modal"
      ? closing
        ? "overlay-modal-out 0.2s ease-out forwards"
        : "overlay-modal-in 0.2s ease-out forwards"
      : closing
        ? "overlay-sidebar-out 0.2s ease-out forwards"
        : "overlay-sidebar-in 0.2s ease-out forwards";

  if (mode === "sidebar") {
    return (
      <div className="fixed inset-0 z-50">
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-black/20"
          style={{ animation: backdropAnimation }}
          onClick={handleClose}
        />
        {/* Sidebar panel */}
        <div
          ref={contentRef}
          className="fixed right-0 top-0 bottom-0 bg-cream dark:bg-card border-l border-brand-border dark:border-border overflow-y-auto"
          style={{
            width: resolvedWidth,
            maxWidth: "90vw",
            animation: contentAnimation,
          }}
        >
          {title && (
            <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 border-b border-brand-border dark:border-border bg-cream/90 dark:bg-card/90 backdrop-blur-sm">
              <h2 className="text-base font-semibold text-bark dark:text-foreground">
                {title}
              </h2>
              <button
                onClick={handleClose}
                className="p-1 rounded-lg text-bark/50 hover:text-bark dark:text-foreground/50 dark:hover:text-foreground hover:bg-sand dark:hover:bg-secondary transition-colors"
                aria-label="关闭"
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path
                    d="M6 6l8 8M14 6l-8 8"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
          )}
          <div className="p-4">{children}</div>
        </div>
      </div>
    );
  }

  // Modal mode
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/20"
        style={{ animation: backdropAnimation }}
        onClick={handleClose}
      />
      {/* Modal panel */}
      <div
        ref={contentRef}
        className="relative bg-cream dark:bg-card rounded-xl overflow-y-auto shadow-lg"
        style={{
          width: resolvedWidth,
          maxWidth: "90vw",
          maxHeight: "82vh",
          borderRadius: "12px",
          animation: contentAnimation,
        }}
      >
        {title && (
          <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 border-b border-brand-border dark:border-border bg-cream/90 dark:bg-card/90 backdrop-blur-sm">
            <h2 className="text-base font-semibold text-bark dark:text-foreground">
              {title}
            </h2>
            <button
              onClick={handleClose}
              className="p-1 rounded-lg text-bark/50 hover:text-bark dark:text-foreground/50 dark:hover:text-foreground hover:bg-sand dark:hover:bg-secondary transition-colors"
              aria-label="关闭"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path
                  d="M6 6l8 8M14 6l-8 8"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        )}
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
