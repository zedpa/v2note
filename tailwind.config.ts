import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ['class'],
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './features/**/*.{js,ts,jsx,tsx,mdx}',
    './shared/**/*.{js,ts,jsx,tsx,mdx}',
    '*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        bark: '#3D3228',
        deer: '#C8845C',
        'deer-dark': '#89502C',
        antler: '#A06B42',
        cream: '#FAF6F0',
        sand: '#F0E8DB',
        'brand-border': '#E0D5C8',
        forest: '#5C7A5E',
        sky: '#7BA3C4',
        dawn: '#E8A87C',
        maple: '#C45C5C',
        // Editorial Serenity surface hierarchy
        surface: '#FDF9F3',
        'surface-low': '#F7F3ED',
        'surface-lowest': '#FFFFFF',
        'surface-high': '#EBE8E2',
        'on-surface': '#1C1C18',
        'ghost-border': 'rgba(215, 194, 184, 0.15)',
        // Accessible muted text (contrast ≥ 4.5:1 on surface)
        'muted-accessible': '#7B6E62',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        chart: {
          '1': 'hsl(var(--chart-1))',
          '2': 'hsl(var(--chart-2))',
          '3': 'hsl(var(--chart-3))',
          '4': 'hsl(var(--chart-4))',
          '5': 'hsl(var(--chart-5))',
        },
        sidebar: {
          DEFAULT: 'hsl(var(--sidebar-background))',
          foreground: 'hsl(var(--sidebar-foreground))',
          primary: 'hsl(var(--sidebar-primary))',
          'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
          accent: 'hsl(var(--sidebar-accent))',
          'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
          border: 'hsl(var(--sidebar-border))',
          ring: 'hsl(var(--sidebar-ring))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      boxShadow: {
        // Editorial Serenity 环境阴影 (on-surface 6% opacity)
        ambient: '0 8px 24px rgba(28, 28, 24, 0.06)',
        // Now Card 突出阴影
        'ambient-lg': '0 12px 32px rgba(28, 28, 24, 0.08)',
      },
      fontFamily: {
        // Editorial Serenity 字体映射
        body: ['var(--font-body)', 'var(--font-cjk)', 'system-ui', 'sans-serif'],
        serif: ['var(--font-serif)', 'Noto Serif SC', 'Georgia', 'serif'],
        mono: ['var(--font-mono)', 'SF Mono', 'Fira Code', 'monospace'],
        // 向后兼容别名
        display: ['var(--font-serif)', 'var(--font-body)', 'system-ui', 'sans-serif'],
        'serif-display': ['var(--font-serif)', 'Georgia', 'serif'],
      },
      keyframes: {
        'card-enter': {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        'todo-check-circle': {
          '0%': { transform: 'scale(1)' },
          '30%': { transform: 'scale(0.85)' },
          '60%': { transform: 'scale(1.15)' },
          '100%': { transform: 'scale(1)' },
        },
        'todo-check-mark': {
          from: { transform: 'scale(0)', opacity: '0' },
          to: { transform: 'scale(1)', opacity: '1' },
        },
        'impact-fill': {
          from: { transform: 'scaleX(0)' },
          to: { transform: 'scaleX(1)' },
        },
        'fade-out': {
          '0%': { opacity: '1' },
          '100%': { opacity: '0' },
        },
        'bubble-enter': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-left': {
          from: { transform: 'translateX(0)' },
          to: { transform: 'translateX(-100%)' },
        },
        'slide-right': {
          from: { transform: 'translateX(-100%)' },
          to: { transform: 'translateX(0)' },
        },
      },
      animation: {
        'card-enter': 'card-enter 0.4s cubic-bezier(0.22,1,0.36,1) both',
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'todo-check-circle': 'todo-check-circle 0.4s cubic-bezier(0.34,1.56,0.64,1)',
        'todo-check-mark': 'todo-check-mark 0.3s cubic-bezier(0.34,1.56,0.64,1) 0.15s both',
        'impact-fill': 'impact-fill 0.6s cubic-bezier(0.22,1,0.36,1) both',
        'fade-out': 'fade-out 0.3s ease-out forwards',
        'bubble-enter': 'bubble-enter 0.3s ease-out both',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}
export default config
