import { Briefcase, Home, Users, BookOpen, Heart, type LucideIcon } from "lucide-react";

export interface DomainStyle {
  label: string;
  icon: LucideIcon;
  fgVar: string;
  bgVar: string;
}

export const DOMAIN_CONFIG: Record<string, DomainStyle> = {
  work:     { label: "工作", icon: Briefcase, fgVar: "--domain-work-fg",     bgVar: "--domain-work-bg" },
  life:     { label: "生活", icon: Home,      fgVar: "--domain-life-fg",     bgVar: "--domain-life-bg" },
  social:   { label: "社交", icon: Users,     fgVar: "--domain-social-fg",   bgVar: "--domain-social-bg" },
  learning: { label: "学习", icon: BookOpen,  fgVar: "--domain-learning-fg", bgVar: "--domain-learning-bg" },
  health:   { label: "健康", icon: Heart,     fgVar: "--domain-health-fg",   bgVar: "--domain-health-bg" },
};

export function getDomainStyle(domain?: string): {
  config: DomainStyle;
  style: { color: string; backgroundColor: string };
  fgStyle: { color: string };
  bgStyle: { backgroundColor: string };
  borderStyle: { borderColor: string };
} {
  const config = DOMAIN_CONFIG[domain ?? "work"] ?? DOMAIN_CONFIG.work;
  return {
    config,
    style: {
      color: `hsl(var(${config.fgVar}))`,
      backgroundColor: `hsl(var(${config.bgVar}))`,
    },
    fgStyle: { color: `hsl(var(${config.fgVar}))` },
    bgStyle: { backgroundColor: `hsl(var(${config.bgVar}))` },
    borderStyle: { borderColor: `hsl(var(${config.fgVar}) / 0.3)` },
  };
}
