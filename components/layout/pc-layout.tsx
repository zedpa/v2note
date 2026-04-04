"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { MenuBar } from "./menu-bar";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { LoginPage } from "@/features/auth/components/login-page";

type Scene = "write" | "timeline" | "map" | "goals";

const SCENE_PATH: Record<Scene, string> = {
  write: "/write",
  timeline: "/timeline",
  map: "/map",
  goals: "/goals",
};

const PATH_SCENE: Record<string, Scene> = {
  "/write": "write",
  "/timeline": "timeline",
  "/map": "map",
  "/goals": "goals",
};

export function PCLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { loggedIn, loading, login, error: authError } = useAuth();

  const currentScene: Scene = PATH_SCENE[pathname] ?? "write";

  const handleSceneChange = (scene: Scene) => {
    router.push(SCENE_PATH[scene]);
  };

  const handleAction = (action: string) => {
    // TODO: wire up actions (search, voice, etc.)
    console.log("[MenuBar action]", action);
  };

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-cream">
        <p className="text-sm text-bark/50">加载中...</p>
      </div>
    );
  }

  if (!loggedIn) {
    return <LoginPage onLogin={login} onLoginWithEmail={() => Promise.resolve()} onSwitchToRegister={() => {}} onForgotPassword={() => {}} error={authError} />;
  }

  return (
    <>
      <MenuBar
        currentScene={currentScene}
        onSceneChange={handleSceneChange}
        onAction={handleAction}
      />
      {children}
    </>
  );
}
