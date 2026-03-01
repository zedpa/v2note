"use client";

import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";

interface MarkdownContentProps {
  children: string;
  className?: string;
}

export function MarkdownContent({ children, className }: MarkdownContentProps) {
  return (
    <div
      className={cn(
        "text-sm leading-relaxed",
        // Headings
        "[&_h1]:text-base [&_h1]:font-bold [&_h1]:mt-4 [&_h1]:mb-2",
        "[&_h2]:text-sm [&_h2]:font-bold [&_h2]:mt-3 [&_h2]:mb-1.5",
        "[&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mt-2 [&_h3]:mb-1",
        // Paragraphs
        "[&_p]:mb-2 [&_p]:last:mb-0",
        // Bold & italic
        "[&_strong]:font-semibold [&_em]:italic",
        // Lists
        "[&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-2",
        "[&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-2",
        "[&_li]:mb-0.5",
        // Tables
        "[&_table]:w-full [&_table]:text-xs [&_table]:border-collapse [&_table]:my-2",
        "[&_th]:border [&_th]:border-border/60 [&_th]:px-2 [&_th]:py-1 [&_th]:bg-secondary/40 [&_th]:text-left [&_th]:font-medium",
        "[&_td]:border [&_td]:border-border/60 [&_td]:px-2 [&_td]:py-1",
        // Horizontal rule
        "[&_hr]:my-3 [&_hr]:border-border/60",
        // Code
        "[&_code]:text-xs [&_code]:bg-secondary/60 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded",
        "[&_pre]:bg-secondary/60 [&_pre]:p-3 [&_pre]:rounded-lg [&_pre]:my-2 [&_pre]:overflow-x-auto",
        // Blockquote
        "[&_blockquote]:border-l-2 [&_blockquote]:border-primary/40 [&_blockquote]:pl-3 [&_blockquote]:my-2 [&_blockquote]:text-muted-foreground",
        className,
      )}
    >
      <ReactMarkdown>{children}</ReactMarkdown>
    </div>
  );
}

/** Strip markdown syntax for plain-text previews */
export function stripMarkdown(text: string): string {
  return text
    .replace(/#{1,6}\s*/g, "")           // headings
    .replace(/\*\*(.+?)\*\*/g, "$1")     // bold
    .replace(/__(.+?)__/g, "$1")         // bold alt
    .replace(/\*(.+?)\*/g, "$1")         // italic
    .replace(/_(.+?)_/g, "$1")           // italic alt
    .replace(/~~(.+?)~~/g, "$1")         // strikethrough
    .replace(/`(.+?)`/g, "$1")           // inline code
    .replace(/^\s*[-*+]\s+/gm, "")       // unordered list markers
    .replace(/^\s*\d+\.\s+/gm, "")       // ordered list markers
    .replace(/\|/g, " ")                  // table pipes
    .replace(/^[-:| ]+$/gm, "")          // table separator rows
    .replace(/>\s?/g, "")                 // blockquote markers
    .replace(/\n{2,}/g, "\n")            // collapse blank lines
    .trim();
}
