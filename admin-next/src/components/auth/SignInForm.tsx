/*
 * 组件：登录表单（SignInForm）
 * 职责：渲染用户名+密码输入表单。"Sign in" 按钮 POST /api/v1/admin/login，
 * 成功后把 JWT 存入 localStorage + admin_token cookie，跳转 / 进入后台。
 */
"use client";
import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import Button from "@/components/ui/button/Button";
import { EyeCloseIcon, EyeIcon } from "@/icons";
import { useRouter } from "next/navigation";
import React, { useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// 从 JWT 推断剩余有效期（秒），用于设置守卫 cookie 的 max-age
function tokenMaxAge(token: string): number {
  try {
    const payload = token.split(".")[1];
    const json = JSON.parse(
      atob(payload.replace(/-/g, "+").replace(/_/g, "/"))
    );
    if (json.exp) return Math.max(0, json.exp - Math.floor(Date.now() / 1000));
  } catch {
    /* ignore */
  }
  return 7200;
}

export default function SignInForm() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/v1/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const json = await res.json();
      if (json.code !== "0") throw new Error(json.msg || "Login failed");
      const token = json.data.access_token as string;
      localStorage.setItem("admin_token", token);
      // 同步写入可读 cookie，供 middleware 路由守卫校验（security-audit F-08）
      document.cookie = `admin_token=${token}; path=/; max-age=${tokenMaxAge(token)}; samesite=lax`;
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col justify-center flex-1 w-full max-w-md mx-auto">
        <div>
          <div className="mb-5 sm:mb-8">
            <h1 className="mb-2 font-semibold text-gray-800 text-title-sm dark:text-white/90 sm:text-title-md">
              Songdian Admin
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Enter your credentials to sign in
            </p>
          </div>
          <div>
            <form onSubmit={handleSubmit}>
              <div className="space-y-5">
                <div>
                  <Label>Username <span className="text-error-500">*</span></Label>
                  <Input
                    placeholder="Enter your username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <Label>Password <span className="text-error-500">*</span></Label>
                  <div className="relative">
                    <Input
                      type={showPassword ? "text" : "password"}
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                    <span
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute z-30 -translate-y-1/2 cursor-pointer right-4 top-1/2"
                    >
                      {showPassword ? (
                        <EyeIcon className="fill-gray-500 dark:fill-gray-400" />
                      ) : (
                        <EyeCloseIcon className="fill-gray-500 dark:fill-gray-400" />
                      )}
                    </span>
                  </div>
                </div>

                {error && (
                  <div className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">
                    {error}
                  </div>
                )}

                <div>
                  <Button className="w-full" size="sm" type="submit" disabled={loading}>
                    {loading ? "Signing in..." : "Sign in"}
                  </Button>
                </div>
              </div>
            </form>
          </div>
        </div>
    </div>
  );
}
