"use client";

import { useState, useRef, useEffect, useCallback } from "react";

interface VerificationCodeInputProps {
  length?: number;
  onComplete: (code: string) => void;
  error?: string | null;
  disabled?: boolean;
}

export function VerificationCodeInput({
  length = 6,
  onComplete,
  error,
  disabled,
}: VerificationCodeInputProps) {
  const [values, setValues] = useState<string[]>(Array(length).fill(""));
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // 错误时清空并聚焦第一格
  useEffect(() => {
    if (error) {
      setValues(Array(length).fill(""));
      inputRefs.current[0]?.focus();
    }
  }, [error, length]);

  const handleChange = useCallback(
    (index: number, value: string) => {
      // 只接受数字
      const digit = value.replace(/\D/g, "").slice(-1);
      const newValues = [...values];
      newValues[index] = digit;
      setValues(newValues);

      if (digit && index < length - 1) {
        inputRefs.current[index + 1]?.focus();
      }

      // 全部填满后自动提交
      if (digit && newValues.every((v) => v)) {
        onComplete(newValues.join(""));
      }
    },
    [values, length, onComplete],
  );

  const handleKeyDown = useCallback(
    (index: number, e: React.KeyboardEvent) => {
      if (e.key === "Backspace" && !values[index] && index > 0) {
        inputRefs.current[index - 1]?.focus();
      }
    },
    [values],
  );

  // 支持粘贴
  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      e.preventDefault();
      const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
      if (!text) return;
      const newValues = Array(length).fill("");
      for (let i = 0; i < text.length; i++) {
        newValues[i] = text[i];
      }
      setValues(newValues);
      if (text.length === length) {
        onComplete(newValues.join(""));
      } else {
        inputRefs.current[text.length]?.focus();
      }
    },
    [length, onComplete],
  );

  return (
    <div className="flex gap-2 justify-center" onPaste={handlePaste}>
      {values.map((val, i) => (
        <input
          key={i}
          ref={(el) => { inputRefs.current[i] = el; }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={val}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          disabled={disabled}
          className={`w-11 h-14 text-center text-xl font-mono rounded-xl outline-none transition-all
            ${error
              ? "bg-maple/10 border-2 border-maple animate-shake"
              : "bg-surface-lowest border-2 border-transparent focus:border-deer/50"
            }
            text-on-surface disabled:opacity-50`}
          autoFocus={i === 0}
        />
      ))}
    </div>
  );
}
