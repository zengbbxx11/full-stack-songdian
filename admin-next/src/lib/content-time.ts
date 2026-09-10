// datetime-local 使用浏览器本地时区；API 使用带时区的 ISO 时间。
export function toLocalDateTime(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const pad = (number: number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function publicationTime(value: string, status: string): string | undefined {
  if (!value) {
    if (status === "SCHEDULED") throw new Error("定时发布必须填写未来的发布时间");
    return undefined;
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("发布时间无效");
  if (status === "SCHEDULED" && date.getTime() <= Date.now()) throw new Error("定时发布时间必须晚于当前时间");
  return date.toISOString();
}
