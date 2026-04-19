import type { Metadata } from "next";
import Link from "next/link";
import { LuluLogo } from "@/components/brand/lulu-logo";

export const metadata: Metadata = {
  title: "念念有路 — 从思考到行动",
  description:
    "AI 驱动的个人认知操作系统。随时记录，自动提取，让每一个想法都有归处。",
};

/* ─── Inline phone mockup (no external images) ─── */
function PhoneMockup({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`relative mx-auto ${className}`} style={{ width: 320, height: 640 }}>
      {/* Device frame */}
      <div
        className="absolute inset-0 rounded-[40px] shadow-2xl"
        style={{
          background: "linear-gradient(145deg, #1a1a1a 0%, #2d2d2d 100%)",
          padding: 8,
        }}
      >
        {/* Screen */}
        <div className="relative w-full h-full rounded-[32px] overflow-hidden bg-[hsl(36,67%,97%)]">
          {/* Notch */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[120px] h-[28px] bg-black rounded-b-2xl z-10" />
          {/* Content */}
          <div className="relative h-full overflow-hidden">{children}</div>
        </div>
      </div>
    </div>
  );
}

/* ─── Mock App Screen: Home ─── */
function MockHomeScreen() {
  return (
    <div className="h-full" style={{ background: "hsl(36,67%,97%)", fontFamily: "var(--font-body)" }}>
      <div className="h-12" />
      <div className="px-5 pt-2 pb-3">
        <div className="font-mono text-[10px] tracking-widest uppercase" style={{ color: "#89502C" }}>
          Mon &middot; 04.19 &middot; 晴
        </div>
        <h2 className="mt-1 font-serif text-[22px] leading-tight" style={{ color: "#3D3228", letterSpacing: "-0.02em" }}>
          下午好，子琪
        </h2>
        <p className="mt-1 font-serif text-sm italic" style={{ color: "#6b5948" }}>
          今日一念：把铝材报价的事推进到签约
        </p>
      </div>

      <div className="px-5 mt-1">
        <div className="flex items-baseline justify-between mb-2">
          <span className="font-serif text-base" style={{ color: "#3D3228" }}>今日流动</span>
          <span className="font-mono text-[10px]" style={{ color: "#89502C" }}>5 条</span>
        </div>

        <div className="rounded-2xl p-3 mb-2" style={{ background: "hsl(38,30%,99%)", boxShadow: "0 1px 2px rgba(28,28,24,0.06)" }}>
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className="font-mono text-[10px]" style={{ color: "#89502C" }}>🎙 &middot; 14:07</span>
            <span className="font-mono text-[10px]" style={{ color: "#aa9785" }}>&middot; 0:52</span>
            <span className="flex-1" />
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full" style={{ background: "hsl(18,100%,96%)", color: "hsl(18,90%,48%)" }}>#工作</span>
          </div>
          <div className="flex gap-[1.5px] items-center h-5 mb-1.5">
            {Array.from({ length: 36 }, (_, i) => (
              <div key={i} className="rounded-sm" style={{
                width: 2, height: 4 + Math.abs(Math.sin(i * 0.7)) * 14,
                background: i < 14 ? "#C8845C" : "rgba(200,132,92,0.35)",
              }} />
            ))}
          </div>
          <p className="text-[12px] leading-relaxed" style={{ color: "#3D3228" }}>
            上午和张总通了电话，他说铝材这周又涨了百分之十五...
          </p>
        </div>

        <div className="flex gap-2 items-start mb-2">
          <div className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-[10px]"
            style={{ background: "linear-gradient(135deg,#89502C,#C8845C)", color: "#fff" }}>🦌</div>
          <div className="rounded-tl-sm rounded-tr-xl rounded-br-xl rounded-bl-xl px-3 py-2 text-[12px] leading-relaxed"
            style={{ background: "rgba(200,132,92,0.12)", color: "#3D3228", maxWidth: 220 }}>
            听起来这件事有点紧迫感。要不要我帮你把<b>敲定新的供应商</b>加到今天的待办里？
          </div>
        </div>
      </div>

      <div className="px-5 mt-2">
        <span className="font-serif text-base" style={{ color: "#3D3228" }}>正在做的事</span>
        <div className="mt-2 space-y-2">
          {[
            { t: "找张总确认铝材报价", d: "工作", time: "15:00", color: "#D84B4B", bg: "hsl(0,100%,96%)" },
            { t: "傍晚跑 5 公里", d: "健康", time: "18:00", color: "#1F8B4C", bg: "hsl(145,76%,94%)" },
          ].map((todo, i) => (
            <div key={i} className="bg-white rounded-xl p-3" style={{
              border: "2px solid #D9D2C4",
              boxShadow: "3px 3px 0 #D9D2C4",
            }}>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full border-2" style={{ borderColor: "#C8845C" }} />
                <span className="text-[12px] font-medium flex-1" style={{ color: "#3D3228" }}>{todo.t}</span>
              </div>
              <div className="flex items-center gap-1.5 mt-1 pl-6">
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full" style={{ background: todo.bg, color: todo.color }}>{todo.d}</span>
                <span className="font-mono text-[10px]" style={{ color: "#89502C" }}>今天 {todo.time}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="absolute right-5 bottom-16">
        <div className="w-14 h-14 rounded-full flex items-center justify-center text-xl shadow-xl"
          style={{ background: "linear-gradient(135deg,#89502C,#C8845C)", color: "#fff", boxShadow: "0 12px 32px rgba(137,80,44,0.35)" }}>
          🎙
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 flex border-t py-2 px-2"
        style={{ background: "rgba(253,249,243,0.9)", backdropFilter: "blur(20px)", borderColor: "rgba(217,210,196,0.5)" }}>
        {[
          { label: "首页", icon: "◉", active: true },
          { label: "待办", icon: "◐", active: false },
          { label: "复盘", icon: "✧", active: false },
          { label: "我", icon: "◯", active: false },
        ].map((tab) => (
          <div key={tab.label} className="flex-1 flex flex-col items-center gap-0.5"
            style={{ color: tab.active ? "#89502C" : "#aa9785" }}>
            <span className="text-sm">{tab.icon}</span>
            <span className="text-[10px]" style={{ fontWeight: tab.active ? 600 : 400 }}>{tab.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Mock App Screen: Recording ─── */
function MockRecordingScreen() {
  return (
    <div className="h-full flex flex-col" style={{ background: "linear-gradient(180deg, hsl(36,50%,96%) 0%, hsl(35,36%,91%) 100%)" }}>
      <div className="h-12" />
      <div className="text-center mt-8">
        <div className="font-mono text-[10px] tracking-widest uppercase" style={{ color: "#89502C" }}>
          RECORDING &middot; 🎙
        </div>
        <div className="font-mono text-5xl mt-2" style={{ color: "#3D3228", fontWeight: 300 }}>01:23</div>
      </div>
      <div className="flex justify-center gap-[2px] mt-6 h-8 items-center px-8">
        {Array.from({ length: 28 }, (_, i) => (
          <div key={i} className="rounded-sm" style={{
            width: 3,
            height: 6 + Math.abs(Math.sin(i * 0.5)) * 22 + (i % 3) * 4,
            background: "#C8845C",
          }} />
        ))}
      </div>
      <div className="flex-1 px-6 mt-8">
        <p className="text-sm leading-relaxed" style={{ color: "#3D3228" }}>
          上午和张总通了电话，他说铝材这周又涨了大概百分之十五，我觉得我们得在周五之前敲定新的供应商方案，不然影响 Q2 的交付节奏......
          <span style={{ opacity: 0.4 }}>│</span>
        </p>
      </div>
      <div className="flex justify-center pb-10">
        <div className="w-14 h-14 rounded-full flex items-center justify-center text-lg"
          style={{ background: "#C45C5C", color: "#fff", boxShadow: "0 12px 32px rgba(196,92,92,0.35)" }}>
          ■
        </div>
      </div>
    </div>
  );
}

/* ─── Mock App Screen: Review ─── */
function MockReviewScreen() {
  return (
    <div className="h-full flex flex-col" style={{ background: "hsl(36,67%,97%)" }}>
      <div className="h-12" />
      <div className="px-5 pt-2 pb-3">
        <div className="font-mono text-[10px] tracking-widest uppercase" style={{ color: "#89502C" }}>
          / review &middot; 🌙
        </div>
        <h2 className="mt-1 font-serif text-[22px] leading-tight" style={{ color: "#3D3228" }}>今晚回顾</h2>
      </div>
      <div className="px-5 flex-1 space-y-3">
        <div className="flex gap-2 items-start">
          <div className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-[10px]"
            style={{ background: "linear-gradient(135deg,#89502C,#C8845C)", color: "#fff" }}>🦌</div>
          <div className="rounded-tl-sm rounded-tr-xl rounded-br-xl rounded-bl-xl px-3 py-2 text-[12px] leading-relaxed"
            style={{ background: "rgba(200,132,92,0.12)", color: "#3D3228", maxWidth: 220 }}>
            子琪，今天记了 <b>5 条笔记</b>，完成了 <b>2 / 4</b> 件重要的事。想不想聊聊今天让你最有感觉的一刻？
          </div>
        </div>
        <div className="flex justify-end">
          <div className="rounded-2xl rounded-tr-sm px-3 py-2 text-[12px] leading-relaxed text-white" style={{ background: "linear-gradient(135deg,#89502C,#C8845C)", maxWidth: 200 }}>
            是电话里张总说"别急"那一下，突然觉得有空间了。
          </div>
        </div>
        <div className="flex gap-2 items-start">
          <div className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-[10px]"
            style={{ background: "linear-gradient(135deg,#89502C,#C8845C)", color: "#fff" }}>🦌</div>
          <div className="rounded-tl-sm rounded-tr-xl rounded-br-xl rounded-bl-xl px-3 py-2 text-[12px] leading-relaxed"
            style={{ background: "rgba(200,132,92,0.12)", color: "#3D3228", maxWidth: 220 }}>
            <span className="inline-flex items-center gap-1 mb-1">
              <span className="text-[9px] font-mono font-medium px-1.5 py-0.5 rounded-full uppercase" style={{ background: "rgba(92,122,94,0.14)", color: "#5C7A5E" }}>realize</span>
            </span>
            <br />
            这个&ldquo;有空间&rdquo;的感受值得写进<b>意图库</b>。我帮你起了个名字：<i>&ldquo;不急，就快&rdquo;</i>。
          </div>
        </div>
      </div>
      <div className="px-4 pb-6 mt-2">
        <div className="flex items-center gap-2 rounded-full px-4 py-1" style={{ background: "rgba(255,255,255,0.9)", boxShadow: "0 4px 16px rgba(28,28,24,0.06)" }}>
          <span className="flex-1 text-[12px] py-2" style={{ color: "#aa9785" }}>继续和路路说说......</span>
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px]"
            style={{ background: "linear-gradient(135deg,#89502C,#C8845C)", color: "#fff" }}>↑</div>
        </div>
      </div>
    </div>
  );
}

/* ─── Feature Card ─── */
function FeatureCard({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="group rounded-2xl p-6 transition-all duration-300 hover:scale-[1.02]"
      style={{ background: "hsl(36,50%,96%)", boxShadow: "0 1px 2px rgba(28,28,24,0.06)" }}>
      <div className="w-12 h-12 rounded-xl flex items-center justify-center text-xl mb-4"
        style={{ background: "rgba(200,132,92,0.12)" }}>
        {icon}
      </div>
      <h3 className="font-serif text-lg mb-2" style={{ color: "#3D3228" }}>{title}</h3>
      <p className="text-sm leading-relaxed" style={{ color: "#6b5948" }}>{desc}</p>
    </div>
  );
}

/* ─── Step Item ─── */
function StepItem({ num, title, desc }: { num: string; title: string; desc: string }) {
  return (
    <div className="flex gap-5">
      <div className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center font-serif text-lg text-white"
        style={{ background: "linear-gradient(135deg,#89502C,#C8845C)" }}>
        {num}
      </div>
      <div className="pt-1">
        <h4 className="font-medium text-base mb-1" style={{ color: "#3D3228" }}>{title}</h4>
        <p className="text-sm leading-relaxed" style={{ color: "#6b5948" }}>{desc}</p>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   Landing Page
   ═══════════════════════════════════════════════ */
export default function HomePage() {
  return (
    <div className="min-h-screen relative" style={{ background: "hsl(36,50%,96%)" }}>
      {/* Noise texture */}
      <div
        className="fixed inset-0 pointer-events-none z-0"
        style={{
          opacity: 0.025,
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />

      {/* ─── NAV ─── */}
      <nav className="relative z-10 max-w-6xl mx-auto px-6 py-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <LuluLogo size={36} variant="color" className="" />
          <span className="font-serif text-xl font-semibold tracking-tight" style={{ color: "#3D3228" }}>
            念念有路
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="text-sm font-medium px-5 py-2.5 rounded-full transition-colors"
            style={{ color: "#89502C", background: "rgba(200,132,92,0.1)" }}
          >
            登录
          </Link>
          <Link
            href="/"
            className="text-sm font-medium px-5 py-2.5 rounded-full text-white transition-transform active:scale-95"
            style={{ background: "linear-gradient(135deg,#89502C,#C8845C)" }}
          >
            免费开始
          </Link>
        </div>
      </nav>

      {/* ─── HERO ─── */}
      <section className="relative z-10 max-w-6xl mx-auto px-6 pt-16 pb-24">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-mono tracking-wide mb-6"
              style={{ background: "rgba(92,122,94,0.1)", color: "#5C7A5E" }}>
              AI 认知操作系统
            </div>
            <h1 className="font-serif leading-tight mb-6" style={{ color: "#3D3228", fontSize: "clamp(2.5rem, 5vw, 3.5rem)", letterSpacing: "-0.02em" }}>
              你的每一个想法，
              <br />
              <span style={{ color: "#89502C" }}>都有归处</span>
            </h1>
            <p className="text-lg leading-relaxed mb-8" style={{ color: "#6b5948", maxWidth: 480 }}>
              随时说出你的想法，念念有路帮你记录、提取、整理。
              从散乱的灵感到清晰的行动，不需要手动归类，
              主题自然涌现。
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/"
                className="inline-flex items-center gap-2 text-base font-medium px-7 py-3.5 rounded-full text-white transition-transform active:scale-95 shadow-lg"
                style={{ background: "linear-gradient(135deg,#89502C,#C8845C)", boxShadow: "0 12px 32px rgba(137,80,44,0.25)" }}
              >
                开始使用
                <span className="text-sm opacity-80">&rarr;</span>
              </Link>
              <a
                href="#how-it-works"
                className="inline-flex items-center gap-2 text-base font-medium px-7 py-3.5 rounded-full transition-colors"
                style={{ color: "#89502C", background: "rgba(200,132,92,0.12)" }}
              >
                了解更多
              </a>
            </div>

            <div className="flex items-center gap-4 mt-10">
              <div className="flex -space-x-2">
                {["Z", "L", "M", "W"].map((letter, i) => (
                  <div key={i} className="w-8 h-8 rounded-full border-2 border-white flex items-center justify-center text-xs font-serif text-white"
                    style={{ background: `linear-gradient(135deg, ${["#89502C", "#5C7A5E", "#7BA3C4", "#C45C5C"][i]}, ${["#C8845C", "#7BA3C4", "#A0C4D8", "#E8A87C"][i]})` }}>
                    {letter}
                  </div>
                ))}
              </div>
              <p className="text-sm" style={{ color: "#89502C" }}>
                <span className="font-semibold">2,000+</span> 人已在使用
              </p>
            </div>
          </div>

          <div className="relative flex justify-center lg:justify-end">
            <div className="relative">
              <PhoneMockup>
                <MockHomeScreen />
              </PhoneMockup>
              <div className="absolute -inset-12 rounded-full -z-10 opacity-30 blur-3xl"
                style={{ background: "radial-gradient(circle, rgba(200,132,92,0.3) 0%, transparent 70%)" }} />
            </div>
          </div>
        </div>
      </section>

      {/* ─── FEATURES ─── */}
      <section className="relative z-10 py-24" style={{ background: "hsl(38,30%,99%)" }}>
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <div className="font-mono text-xs tracking-widest uppercase mb-3" style={{ color: "#89502C" }}>
              Core Features
            </div>
            <h2 className="font-serif text-3xl md:text-4xl mb-4" style={{ color: "#3D3228", letterSpacing: "-0.02em" }}>
              混沌输入，结构涌现
            </h2>
            <p className="text-base mx-auto" style={{ color: "#6b5948", maxWidth: 520 }}>
              不需要手动分类。把任何想法丢进来，AI 帮你发现联系、提炼主题、安排行动。
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            <FeatureCard
              icon={<span>🎙</span>}
              title="随时录，随时记"
              desc="按住说话，松开自动记录。语音实时转写，AI 提取关键信息，生成待办和标签。"
            />
            <FeatureCard
              icon={<span>🦌</span>}
              title="路路：你的认知伙伴"
              desc="不打扰，只在你需要时出现。每日回顾帮你复盘，发现思考中隐藏的联系和矛盾。"
            />
            <FeatureCard
              icon={<span className="text-lg">◐</span>}
              title="待办自然生长"
              desc="从你的笔记和对话中，AI 自动识别行动项。语音指令即可创建、完成、修改待办。"
            />
            <FeatureCard
              icon={<span className="text-lg">✧</span>}
              title="每日回顾"
              desc="早晨简报和晚间复盘。AI 帮你回顾一天的思考，发现规律，记录领悟。"
            />
            <FeatureCard
              icon={<span className="text-lg">⊛</span>}
              title="主题涌现"
              desc="相关的想法自动聚类。你关心什么，从记录密度中自然长出，无需手动整理。"
            />
            <FeatureCard
              icon={<span className="text-lg">⟡</span>}
              title="隐私安全"
              desc="你的想法只属于你。端到端加密传输，数据存储在你信任的环境中。"
            />
          </div>
        </div>
      </section>

      {/* ─── PHONE SHOWCASE ─── */}
      <section className="relative z-10 py-24 overflow-hidden">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <div className="font-mono text-xs tracking-widest uppercase mb-3" style={{ color: "#89502C" }}>
              Experience
            </div>
            <h2 className="font-serif text-3xl md:text-4xl mb-4" style={{ color: "#3D3228", letterSpacing: "-0.02em" }}>
              沉浸式体验
            </h2>
            <p className="text-base mx-auto" style={{ color: "#6b5948", maxWidth: 480 }}>
              从录音到回顾，每个环节都经过精心设计。
            </p>
          </div>

          <div className="flex flex-col md:flex-row items-center justify-center gap-8 md:gap-12">
            <div className="text-center">
              <PhoneMockup className="scale-90 md:scale-100">
                <MockRecordingScreen />
              </PhoneMockup>
              <p className="mt-4 font-mono text-xs tracking-wide uppercase" style={{ color: "#89502C" }}>
                沉浸录音
              </p>
            </div>
            <div className="text-center">
              <PhoneMockup className="scale-90 md:scale-100">
                <MockReviewScreen />
              </PhoneMockup>
              <p className="mt-4 font-mono text-xs tracking-wide uppercase" style={{ color: "#89502C" }}>
                每日回顾
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ─── HOW IT WORKS ─── */}
      <section id="how-it-works" className="relative z-10 py-24" style={{ background: "hsl(38,30%,99%)" }}>
        <div className="max-w-3xl mx-auto px-6">
          <div className="text-center mb-16">
            <div className="font-mono text-xs tracking-widest uppercase mb-3" style={{ color: "#89502C" }}>
              How It Works
            </div>
            <h2 className="font-serif text-3xl md:text-4xl mb-4" style={{ color: "#3D3228", letterSpacing: "-0.02em" }}>
              从思考到行动，三步完成
            </h2>
          </div>

          <div className="space-y-10">
            <StepItem
              num="1"
              title="随时记录"
              desc="按住麦克风，说出你的想法。文字、语音、任何形式。不需要整理，不需要分类，只管倒出来。"
            />
            <div className="ml-5 w-px h-8" style={{ background: "rgba(200,132,92,0.2)" }} />
            <StepItem
              num="2"
              title="AI 自动提取"
              desc="念念有路自动识别你话语中的待办、灵感、情绪和关键信息。相关主题自然聚类，结构从内容中涌现。"
            />
            <div className="ml-5 w-px h-8" style={{ background: "rgba(200,132,92,0.2)" }} />
            <StepItem
              num="3"
              title="回顾与行动"
              desc="每天和路路聊聊，复盘一天的思考。AI 帮你发现规律、提醒待办、记录领悟。你的每一念，都是前进的路。"
            />
          </div>
        </div>
      </section>

      {/* ─── QUOTE ─── */}
      <section className="relative z-10 py-24">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <LuluLogo size={64} variant="color" className="mx-auto mb-8" />
          <blockquote className="font-serif text-2xl md:text-3xl italic leading-relaxed mb-6" style={{ color: "#3D3228" }}>
            &ldquo;念念不忘，必有回响。
            <br />
            每一个想法，都是路上的一步。&rdquo;
          </blockquote>
          <p className="text-sm font-mono tracking-wide" style={{ color: "#89502C" }}>
            &mdash; 念念有路
          </p>
        </div>
      </section>

      {/* ─── CTA ─── */}
      <section className="relative z-10 py-24" style={{ background: "#3D3228" }}>
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="font-serif text-3xl md:text-4xl mb-4 text-white" style={{ letterSpacing: "-0.02em" }}>
            开始你的认知之旅
          </h2>
          <p className="text-base mb-8 mx-auto" style={{ color: "rgba(255,255,255,0.6)", maxWidth: 420 }}>
            加入念念有路，让每一个想法都有归处。
            免费开始，无需信用卡。
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-base font-medium px-8 py-4 rounded-full text-white transition-transform active:scale-95 shadow-lg"
              style={{ background: "linear-gradient(135deg,#89502C,#C8845C)", boxShadow: "0 12px 32px rgba(137,80,44,0.4)" }}
            >
              免费注册
              <span className="text-sm opacity-80">&rarr;</span>
            </Link>
          </div>
          <div className="flex items-center justify-center gap-6 mt-8 text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>
            <span>iOS &amp; Android</span>
            <span>&middot;</span>
            <span>桌面端</span>
            <span>&middot;</span>
            <span>网页版</span>
          </div>
        </div>
      </section>

      {/* ─── FOOTER ─── */}
      <footer className="relative z-10 py-12 border-t" style={{ borderColor: "rgba(217,210,196,0.3)" }}>
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <LuluLogo size={28} variant="color" className="" />
              <span className="font-serif text-base font-medium" style={{ color: "#3D3228" }}>念念有路</span>
            </div>
            <div className="flex items-center gap-6 text-sm" style={{ color: "#89502C" }}>
              <a href="#" className="hover:underline">关于</a>
              <a href="#" className="hover:underline">帮助</a>
              <a href="#" className="hover:underline">隐私政策</a>
              <a href="#" className="hover:underline">服务条款</a>
            </div>
            <p className="text-xs" style={{ color: "#aa9785" }}>
              &copy; 2026 念念有路. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
