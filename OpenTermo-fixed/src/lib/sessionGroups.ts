/**
 * 分组名册存在本机 localStorage，数组顺序即分组的显示顺序。
 * 会话自身的 group 字段在会话存储里；Default 是内置落点，不进名册、永远置顶。
 */
export const LS_KNOWN_GROUPS = "opentermo-known-groups";

/** 未分组会话的落点，是内置分组，不能作为新建分组的名称 */
export const RESERVED_GROUP = "Default";

export function loadGroupOrder(): string[] {
  try {
    const raw = localStorage.getItem(LS_KNOWN_GROUPS);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return [
      ...new Set(
        (parsed as unknown[]).filter(
          (g): g is string => typeof g === "string" && !!g && g !== RESERVED_GROUP
        )
      ),
    ];
  } catch {
    return [];
  }
}

export function saveGroupOrder(list: string[]) {
  localStorage.setItem(LS_KNOWN_GROUPS, JSON.stringify(list));
}

/** 登记一个分组名：空分组也要留在名册里，不会因为组内没有会话而凭空消失。 */
export function registerKnownGroup(name: string) {
  const list = loadGroupOrder();
  if (list.includes(name)) return;
  saveGroupOrder([...list, name]);
}

/**
 * 唯一的分组顺序出口：Default（若在场）置顶 → 名册顺序 → 未登记的按名称追加在尾部。
 * 名册里的组一定在场（空分组也要能显示 / 能被选到）；未登记的组来自老数据或导入的
 * 会话，排在后面而不是被丢掉。
 * roster 默认读 localStorage；已把名册拿在手里的调用方（启动台）请显式传入，
 * 否则状态刚改、还没落盘的那一帧会渲染出旧顺序。
 */
export function orderGroups(names: Iterable<string>, roster: string[] = loadGroupOrder()): string[] {
  const present = [...new Set([...names].filter((g): g is string => !!g))];
  const hasDefault = present.includes(RESERVED_GROUP);
  const unregistered = present
    .filter((g) => g !== RESERVED_GROUP && !roster.includes(g))
    .sort((a, b) => a.localeCompare(b, "en"));
  return [
    ...(hasDefault ? [RESERVED_GROUP] : []),
    ...roster,
    ...unregistered,
  ];
}

/** 可排序（可上移 / 下移）的分组：排除置顶的 Default。 */
export function movableGroups(names: Iterable<string>, roster: string[] = loadGroupOrder()): string[] {
  return orderGroups(names, roster).filter((g) => g !== RESERVED_GROUP);
}
