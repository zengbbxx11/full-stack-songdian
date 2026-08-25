/*
 * StatsBand —— 首页核心经营数据展示带
 * 深色 Carbon Dark 背景，打破首页浅色区块节奏，形成明暗层次。
 * 数字始终展示真实最终值，避免计数动画短暂呈现错误事实。
 * 数据源：ABOUT.stats（content-data），全部为真实经营指标。
 */

import { ABOUT } from "@/lib/content-data";

export default function StatsBand() {
  return (
    <section className="bg-[#111316] py-16 md:py-20" aria-label="Company at a glance">
      <div className="site-container">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-10 md:grid-cols-3 lg:grid-cols-6">
          {ABOUT.stats.map((s) => (
            <div key={s.label} className="border-l border-white/12 pl-4 text-left md:pl-6">
              <dd className="text-4xl md:text-5xl font-semibold tracking-tight text-white tabular-nums">
                <span className="fact-reveal">
                  {s.format ? s.value.toLocaleString("en-US") : s.value}
                </span>
                {s.suffix}
              </dd>
              <dt className="mt-2 text-sm font-medium text-white/55">{s.label}</dt>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
