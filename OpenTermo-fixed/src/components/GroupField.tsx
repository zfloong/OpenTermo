import { Plus } from "lucide-react";
import { alertMessage, promptText } from "@/components/ui/confirm-dialog";
import {
  RESERVED_GROUP,
  movableGroups,
  registerKnownGroup,
} from "@/lib/sessionGroups";

interface GroupFieldProps {
  /** 表单当前选中的分组，"" 表示 Default */
  value: string;
  onChange: (group: string) => void;
  /** 会话里已经在用的分组名；名册（含空分组）由组件自己读 */
  usedGroups: string[];
  /** 两个弹窗的控件高度不同（h-8 / h-9），由调用方传入 */
  selectClass: string;
}

/** 分组选择 + 就地新建：与启动台共用 orderGroups 这一个顺序出口，规则也一致。 */
export function GroupField({ value, onChange, usedGroups, selectClass }: GroupFieldProps) {
  const options = movableGroups([...usedGroups, value]);

  const handleNewGroup = async () => {
    const name = await promptText({
      title: "新建分组",
      message: "新建后这条会话会直接放进去。",
      input: { label: "分组名称", placeholder: "例如：生产环境" },
    });
    if (!name) return;
    if (name === RESERVED_GROUP) {
      await alertMessage("名称不可用", `「${RESERVED_GROUP}」是内置分组，未分组的会话就在里面。请换一个名称。`);
      return;
    }
    if (options.includes(name)) {
      await alertMessage("分组已存在", `已有名为「${name}」的分组，请换一个名称。`);
      return;
    }
    registerKnownGroup(name);
    onChange(name);
  };

  return (
    <div className="flex items-stretch gap-1.5">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="分组"
        className={`flex-1 min-w-0 ${selectClass}`}
      >
        <option value="">Default</option>
        {options.map((g) => (
          <option key={g} value={g}>{g}</option>
        ))}
      </select>
      <button
        type="button"
        onClick={handleNewGroup}
        title="新建分组"
        className="shrink-0 flex items-center gap-1 px-2 rounded-md text-xs font-medium text-[var(--text-secondary)] border border-[var(--border-strong)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] transition-colors"
      >
        <Plus size={13} />
        新建分组
      </button>
    </div>
  );
}
