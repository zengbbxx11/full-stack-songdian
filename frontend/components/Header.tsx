/**
 * 页面顶部固定导航栏
 * ------------------------------------------------------------------
 * 默认：白色背景 + 深色文字。
 * 滚动后：毛玻璃效果 + 底部边框。
 *
 * Bug 修复：移动端菜单移出 <header>，避免 backdrop-filter 创建新定位上下文
 * 导致 fixed 菜单被困在 56px header 高度内无法显示。
 */
"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MEDIA } from "@/lib/media";
import InstantSearch from "@/components/InstantSearch";
import { InteractiveHoverButton } from "@/components/ui/interactive-hover-button";

interface NavLink {
  label: string;
  href: string;
  children?: { label: string; href: string }[];
}

const NAV_LINKS: NavLink[] = [
  { label: "Home", href: "/" },
  { label: "Products", href: "/products" },
  {
    label: "Solutions",
    href: "/solutions",
    children: [
      { label: "OEM / ODM", href: "/solutions" },
      { label: "FAQ", href: "/solutions/faq" },
    ],
  },
  { label: "News", href: "/news" },
  { label: "About", href: "/about" },
];

const COLORS = {
  carbonDark: "#171A20",
  electricBlue: "#3E6AE1",
  electricBlueHover: "#3457B8",
  brandRed: "#d4343e",
  brandRedHover: "#b91c1c",
  white: "#FFFFFF",
} as const;

export default function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const pathname = usePathname();
  const dropdownRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
    setActiveDropdown(null);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  const handleMouseEnter = (label: string) => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setActiveDropdown(label);
  };

  const handleMouseLeave = () => {
    closeTimer.current = setTimeout(() => setActiveDropdown(null), 200);
  };

  const handleDropdownKey = (e: React.KeyboardEvent, label: string) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setActiveDropdown((prev) => (prev === label ? null : label));
    }
    if (e.key === "Escape") {
      setActiveDropdown(null);
    }
  };

  return (
    <>
      {/* ====================== 顶部导航栏 ====================== */}
      <header
        className={`fixed top-0 left-0 right-0 z-50 transition-all bg-white ${
          scrolled ? "backdrop-blur-xl border-b border-[#EEEEEE]" : ""
        }`}
        style={{
          transitionDuration: "0.33s",
          transitionProperty: "background-color, backdrop-filter",
        }}
      >
        <div className="relative max-w-7xl mx-auto px-6 h-14 flex items-center">
          {/* Logo */}
          <div className="flex-1 flex items-center">
            <Link href="/" className="flex items-center shrink-0">
              <Image
                src={MEDIA.logo}
                alt="Songdian Technology"
                width={128}
                height={32}
                className="h-8 w-auto"
                priority
                unoptimized
              />
            </Link>
          </div>

          {/* 桌面端导航 */}
          <nav
            ref={dropdownRef}
            className="hidden md:flex items-center gap-1 absolute left-1/2 -translate-x-1/2"
          >
            {NAV_LINKS.map((item) => {
              const isActive =
                pathname === item.href ||
                (item.href !== "/" && pathname.startsWith(item.href));
              const hasDropdown = !!item.children;

              return (
                <div
                  key={item.label}
                  className="relative"
                  onMouseEnter={() => hasDropdown && handleMouseEnter(item.label)}
                  onMouseLeave={() => hasDropdown && handleMouseLeave()}
                  onFocus={() => hasDropdown && handleMouseEnter(item.label)}
                  onBlur={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                      handleMouseLeave();
                    }
                  }}
                >
                  <Link
                    href={item.href}
                    className="inline-flex items-center px-3 py-2 text-[16px] font-medium rounded text-[#171A20] hover:text-[#d4343e] transition-colors duration-[330ms]"
                    style={
                      isActive
                        ? { fontSize: "16px", fontWeight: 500, color: COLORS.brandRed, borderRadius: "4px" }
                        : { fontSize: "16px", fontWeight: 500, borderRadius: "4px" }
                    }
                    aria-haspopup={hasDropdown ? "true" : undefined}
                    aria-expanded={hasDropdown ? activeDropdown === item.label : undefined}
                    onKeyDown={(e) => hasDropdown && handleDropdownKey(e, item.label)}
                  >
                    {item.label}
                    {hasDropdown && (
                      <svg
                        className={`w-3.5 h-3.5 ml-1 transition-transform ${
                          activeDropdown === item.label ? "rotate-180" : ""
                        }`}
                        style={{ transitionDuration: "0.33s" }}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    )}
                  </Link>

                  {hasDropdown && (
                    <div
                      onMouseEnter={() => handleMouseEnter(item.label)}
                      onMouseLeave={handleMouseLeave}
                      className={`absolute top-full left-1/2 -translate-x-1/2 mt-1 w-36 bg-white border border-gray-100 rounded-lg py-1.5 shadow-[0_4px_16px_rgba(0,0,0,0.06)] transition-all origin-top ${
                        activeDropdown === item.label
                          ? "opacity-100 scale-100 translate-y-0"
                          : "opacity-0 scale-95 -translate-y-1 pointer-events-none"
                      }`}
                      style={{ transitionDuration: "0.2s" }}
                    >
                      {item.children!.map((child) => (
                        <Link
                          key={child.label}
                          href={child.href}
                          className="flex items-center px-4 py-2.5 mx-1 text-[15px] rounded-md hover:bg-gray-50 text-[#171A20] hover:text-[#d4343e] transition-colors duration-[150ms]"
                          style={{ fontSize: "15px", fontWeight: 400 }}
                        >
                          {child.label}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>

          {/* 右侧：搜索 + CTA + 汉堡 */}
          <div className="flex-1 flex items-center justify-end gap-3">
            <InstantSearch className="hidden md:block" />
            <InteractiveHoverButton
              onClick={() => { window.location.href = "/contact"; }}
              fill="bg-[#d4343e]"
              className={`hidden md:inline-flex border-[#d4343e] bg-white text-[#171A20] h-[40px] px-5 text-[14px] transition-[box-shadow] duration-300 ${
                scrolled ? "shadow-[0_2px_16px_rgba(212,52,62,0.45)]" : "shadow-sm"
              }`}
            >
              Request Quote
            </InteractiveHoverButton>

            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="md:hidden w-10 h-10 flex items-center justify-center rounded"
              style={{ borderRadius: "4px" }}
              aria-label="Toggle menu"
              aria-expanded={mobileOpen}
            >
              <div className="w-5 h-4 relative flex flex-col justify-between">
                <span
                  className={`block h-[2px] w-full rounded-full transition-all origin-center ${
                    mobileOpen ? "rotate-45 translate-y-[7px]" : ""
                  }`}
                  style={{ backgroundColor: COLORS.carbonDark, transitionDuration: "0.33s" }}
                />
                <span
                  className={`block h-[2px] w-full rounded-full transition-all ${
                    mobileOpen ? "opacity-0 scale-x-0" : ""
                  }`}
                  style={{ backgroundColor: COLORS.carbonDark, transitionDuration: "0.33s" }}
                />
                <span
                  className={`block h-[2px] w-full rounded-full transition-all origin-center ${
                    mobileOpen ? "-rotate-45 -translate-y-[7px]" : ""
                  }`}
                  style={{ backgroundColor: COLORS.carbonDark, transitionDuration: "0.33s" }}
                />
              </div>
            </button>
          </div>
        </div>
      </header>

      {/* ====================== 移动端菜单 — 在 <header> 外部，避免 backdrop-filter 劫持 fixed 定位 ====================== */}
      <div
        className={`md:hidden fixed inset-0 top-14 bg-white z-40 transition-all overflow-y-auto ${
          mobileOpen ? "opacity-100 visible" : "opacity-0 invisible pointer-events-none"
        }`}
        style={{ transitionDuration: "0.33s" }}
      >
        <nav className="flex flex-col p-6 gap-1">
          {NAV_LINKS.map((item, i) => (
            <div
              key={item.label}
              className="animate-fade-in-up"
              style={{ animationDelay: mobileOpen ? `${i * 60}ms` : "0ms" }}
            >
              <Link
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className="block px-4 py-3 text-[16px] font-medium rounded text-[#171A20] hover:text-[#d4343e] transition-colors duration-[330ms]"
                style={{ fontSize: "16px", fontWeight: 500, borderRadius: "4px" }}
              >
                {item.label}
              </Link>
              {item.children && (
                <div className="ml-4 mt-1 space-y-1 pl-4" style={{ borderLeft: "2px solid #EEEEEE" }}>
                  {item.children.map((child) => (
                    <Link
                      key={child.label}
                      href={child.href}
                      onClick={() => setMobileOpen(false)}
                      className="block px-3 py-2 text-[15px] font-normal rounded text-[#171A20] hover:text-[#d4343e] transition-colors duration-[330ms]"
                      style={{ fontSize: "15px", fontWeight: 400, borderRadius: "4px" }}
                    >
                      {child.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ))}

          <div className="pt-4 mt-1">
            <InstantSearch />
          </div>

          <div className="pt-5 mt-3" style={{ borderTop: "1px solid #EEEEEE" }}>
            <InteractiveHoverButton
              onClick={() => { setMobileOpen(false); window.location.href = "/contact"; }}
              fill="bg-[#d4343e]"
              className="block w-full border-[#d4343e] bg-white text-[#171A20] shadow-sm h-[44px] px-6 text-[15px]"
            >
              Request Quote
            </InteractiveHoverButton>
          </div>
        </nav>
      </div>
    </>
  );
}
