/**
 * 字体本地化配置
 *
 * 通过 @fontsource 加载字体到本地 bundle，替代 Google Fonts CDN。
 * 好处：离线可用、无 FOUT、不依赖网络。
 *
 * @fontsource 的 CSS 文件包含 @font-face 声明 + unicode-range 分片，
 * webpack/Next.js 构建时会将 .woff2 文件复制到 output 目录。
 *
 * 字重精简策略（来源：spec 120 场景 3.3）：
 * - Inter: 400/500/600
 * - Newsreader: 300/400/500/600 + italic
 * - Noto Sans SC: 400/500/700
 * - Noto Serif SC: 400/700
 */

// Inter — 正文字体
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";

// Newsreader — 标题衬线字体
import "@fontsource/newsreader/300.css";
import "@fontsource/newsreader/400.css";
import "@fontsource/newsreader/500.css";
import "@fontsource/newsreader/600.css";
import "@fontsource/newsreader/300-italic.css";
import "@fontsource/newsreader/400-italic.css";
import "@fontsource/newsreader/500-italic.css";
import "@fontsource/newsreader/600-italic.css";

// Noto Sans SC — 中文正文字体（unicode-range 分片，按需加载）
import "@fontsource/noto-sans-sc/400.css";
import "@fontsource/noto-sans-sc/500.css";
import "@fontsource/noto-sans-sc/700.css";

// Noto Serif SC — 中文标题衬线字体
import "@fontsource/noto-serif-sc/400.css";
import "@fontsource/noto-serif-sc/700.css";
