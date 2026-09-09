// 把筛选后的顺序放回原有槽位，未显示的内容保持相对位置。
export function mergeVisibleOrder<T extends { id: number }>(all: T[], visible: T[]): T[] {
  const allIds = new Set(all.map(item => item.id));
  if (visible.some(item => !allIds.has(item.id))) {
    throw new Error("列表内容已变化，请重新加载后排序");
  }
  const visibleIds = new Set(visible.map(item => item.id));
  let index = 0;
  return all.map(item => visibleIds.has(item.id) ? visible[index++] : item);
}
