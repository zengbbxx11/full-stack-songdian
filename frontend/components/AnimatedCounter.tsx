/**
 * Fact-safe statistic display. The real value is present in the
 * server-rendered HTML; CSS may reveal it without changing the fact itself.
 */

interface CounterProps {
  /** 目标数字（不带格式，如 40000） */
  target: number;
  /** 显示格式：前缀 + 数字 + 后缀 */
  prefix?: string;
  suffix?: string;
  /** 数字格式化（true = 千分位逗号） */
  format?: boolean;
  /** 覆盖默认字号等样式 */
  className?: string;
}

export function AnimatedCounter({
  target,
  prefix = "",
  suffix = "",
  format = false,
  className = "",
}: CounterProps) {
  const formatted = format ? target.toLocaleString("en-US") : target.toString();

  return (
    <div
      className={`fact-reveal font-bold tracking-tight tabular-nums ${className}`}
    >
      <span style={{ color: "var(--foreground)" }}>
        {prefix}
        {formatted}
        {suffix}
      </span>
    </div>
  );
}
