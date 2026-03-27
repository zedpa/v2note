"use client";

import { ArrowLeft, Sun, Target, Moon, Phone, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNotifications, type AppNotification } from "../hooks/use-notifications";

interface NotificationCenterProps {
  onClose: () => void;
  onNavigate?: (type: AppNotification["type"]) => void;
}

const TYPE_CONFIG: Record<
  AppNotification["type"],
  { icon: React.ReactNode; label: string }
> = {
  morning_briefing: {
    icon: <Sun size={16} className="text-dawn" />,
    label: "晨间简报已生成",
  },
  todo_nudge: {
    icon: <Target size={16} className="text-deer" />,
    label: "重要待办提醒",
  },
  evening_summary: {
    icon: <Moon size={16} className="text-sky" />,
    label: "今日总结已生成",
  },
  relay_reminder: {
    icon: <Phone size={16} className="text-forest" />,
    label: "待转达消息",
  },
  cognitive_alert: {
    icon: <Zap size={16} className="text-maple" />,
    label: "认知发现",
  },
};

export function NotificationCenter({ onClose, onNavigate }: NotificationCenterProps) {
  const { notifications, markRead, markAllRead } = useNotifications();

  const handleClick = (item: AppNotification) => {
    markRead(item.id);
    onNavigate?.(item.type);
  };

  return (
    <div className="fixed inset-0 z-50 bg-surface overflow-y-auto">
      {/* 顶部栏 */}
      <header
        className="sticky top-0 z-10 flex items-center justify-between px-4 h-[44px] bg-surface/80 backdrop-blur-[12px]"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <button
          onClick={onClose}
          className="w-9 h-9 flex items-center justify-center rounded-full text-muted-accessible hover:text-on-surface transition-colors"
          aria-label="返回"
        >
          <ArrowLeft size={20} />
        </button>
        <span className="text-sm font-medium text-on-surface">通知</span>
        <button
          onClick={markAllRead}
          className="text-xs text-deer hover:text-deer-dark transition-colors px-2 py-1"
        >
          全部已读
        </button>
      </header>

      {/* 通知列表 */}
      <div className="px-4 pb-24">
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <p className="font-serif text-xl text-muted-accessible">暂无通知</p>
            <p className="text-sm text-muted-accessible mt-2">
              路路有消息会通知你
            </p>
          </div>
        ) : (
          <div className="space-y-2 pt-2">
            {notifications.map((item) => {
              const config = TYPE_CONFIG[item.type];
              const timeStr = formatTimeAgo(item.timestamp);

              return (
                <button
                  key={item.id}
                  onClick={() => handleClick(item)}
                  className={cn(
                    "w-full flex items-start gap-3 p-4 rounded-xl text-left transition-colors",
                    item.read
                      ? "bg-surface-low"
                      : "bg-surface-lowest",
                  )}
                >
                  {/* 图标 */}
                  <div className="w-8 h-8 rounded-full bg-surface-high flex items-center justify-center shrink-0 mt-0.5">
                    {config.icon}
                  </div>

                  {/* 内容 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {!item.read && (
                        <span className="w-1.5 h-1.5 rounded-full bg-deer shrink-0" />
                      )}
                      <span
                        className={cn(
                          "text-sm",
                          item.read ? "text-muted-accessible" : "text-on-surface font-medium",
                        )}
                      >
                        {item.title || config.label}
                      </span>
                    </div>
                    {item.body && (
                      <p className="text-xs text-muted-accessible mt-1 line-clamp-2">
                        {item.body}
                      </p>
                    )}
                    <p className="text-[10px] font-mono text-muted-accessible mt-1.5">
                      {timeStr}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function formatTimeAgo(isoStr: string): string {
  const now = Date.now();
  const then = new Date(isoStr).getTime();
  const diffMin = Math.floor((now - then) / 60000);

  if (diffMin < 1) return "刚刚";
  if (diffMin < 60) return `${diffMin}分钟前`;

  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}小时前`;

  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `${diffDay}天前`;

  return new Date(isoStr).toLocaleDateString("zh-CN", {
    month: "numeric",
    day: "numeric",
  });
}
