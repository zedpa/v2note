/** 项目卡片调色板 — 8 色循环分配 */
export interface ProjectColor {
  bg: string;
  text: string;
  border: string;
}

export const PROJECT_COLORS: ProjectColor[] = [
  { bg: "bg-violet-100 dark:bg-violet-900/30",   text: "text-violet-700 dark:text-violet-300",   border: "border-violet-200 dark:border-violet-800" },
  { bg: "bg-rose-100 dark:bg-rose-900/30",       text: "text-rose-700 dark:text-rose-300",       border: "border-rose-200 dark:border-rose-800" },
  { bg: "bg-amber-100 dark:bg-amber-900/30",     text: "text-amber-700 dark:text-amber-300",     border: "border-amber-200 dark:border-amber-800" },
  { bg: "bg-emerald-100 dark:bg-emerald-900/30", text: "text-emerald-700 dark:text-emerald-300", border: "border-emerald-200 dark:border-emerald-800" },
  { bg: "bg-sky-100 dark:bg-sky-900/30",         text: "text-sky-700 dark:text-sky-300",         border: "border-sky-200 dark:border-sky-800" },
  { bg: "bg-pink-100 dark:bg-pink-900/30",       text: "text-pink-700 dark:text-pink-300",       border: "border-pink-200 dark:border-pink-800" },
  { bg: "bg-teal-100 dark:bg-teal-900/30",       text: "text-teal-700 dark:text-teal-300",       border: "border-teal-200 dark:border-teal-800" },
  { bg: "bg-orange-100 dark:bg-orange-900/30",   text: "text-orange-700 dark:text-orange-300",   border: "border-orange-200 dark:border-orange-800" },
];

/** 按索引获取颜色，循环分配 */
export function getProjectColor(index: number): ProjectColor {
  return PROJECT_COLORS[index % PROJECT_COLORS.length];
}
