import { useState } from "react";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { useCommandStore } from "@/stores/commandStore";
import type { CommandEntry } from "@/lib/tauriCommands";

interface AddCommandDialogProps {
  onClose: () => void;
  editEntry?: CommandEntry;
}

export default function AddCommandDialog({ onClose, editEntry }: AddCommandDialogProps) {
  const [label, setLabel] = useState(editEntry?.label || "");
  const [command, setCommand] = useState(editEntry?.command || "");
  const [category, setCategory] = useState(editEntry?.category || "");
  const [saving, setSaving] = useState(false);
  const upsertCommand = useCommandStore((s) => s.upsert);
  const loadCommands = useCommandStore((s) => s.load);

  const isEditing = !!editEntry;
  const isValid = label.trim().length > 0 && command.trim().length > 0;

  const handleSave = async () => {
    if (!isValid) return;
    setSaving(true);
    try {
      await upsertCommand({
        id: editEntry?.id || crypto.randomUUID(),
        label: label.trim(),
        command: command.trim(),
        category: category.trim(),
        pinned: editEntry?.pinned ?? false,
        last_used: editEntry?.last_used ?? null,
        icon: editEntry?.icon ?? null,
        description: editEntry?.description ?? null,
        order: editEntry?.order ?? null,
      });
      await loadCommands();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-xl h-auto max-h-[85vh] p-0 overflow-hidden rounded-2xl flex flex-col" style={{
        background: "var(--surface-container-low)",
        border: "1px solid var(--outline-variant)",
        boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
      }}>
        {/* Header */}
        <div className="px-5 py-2.5 border-b border-outline-variant/20 flex items-center justify-between shrink-0" style={{ background: "var(--surface-container)" }}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-secondary/10 border border-secondary/20 flex items-center justify-center text-secondary">
              <span className="material-symbols-outlined text-[20px]">terminal</span>
            </div>
            <div>
              <h2 className="text-[15px] font-semibold text-on-surface">{isEditing ? "编辑脚本命令" : "新建脚本命令"}</h2>
              <p className="text-[10px] text-on-surface-variant">{isEditing ? "修改终端脚本参数" : "创建一个可快速执行的终端脚本"}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-variant/30 transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Form body */}
        <div className="px-5 py-4 overflow-y-auto flex-1">
          <div className="space-y-4">
            {/* 命令名称 */}
            <section>
              <h3 className="text-[11px] font-semibold text-secondary uppercase tracking-widest mb-2.5 flex items-center gap-2">
                <span className="material-symbols-outlined text-[15px]">badge</span> 基本信息
              </h3>
              <div className="grid grid-cols-1 gap-3 bg-surface-dim p-3.5 rounded-xl border border-outline-variant/30">
                <div>
                  <label className="block text-[13px] text-on-surface-variant mb-1.5">命令名称</label>
                  <div className="relative">
                    <input
                      value={label}
                      onChange={(e) => setLabel(e.target.value)}
                      className="w-full px-3.5 py-2 rounded-xl bg-surface-container-low border-outline-variant text-on-surface placeholder:text-outline/60 text-[14px] focus:bg-surface-container focus:border-secondary focus:shadow-[0_0_0_2px_var(--secondary-glow)] transition-all"
                      placeholder="例如：更新系统、检查日志..."
                      type="text"
                    />
                  </div>
                </div>
              </div>
            </section>

            {/* 命令内容 */}
            <section>
              <h3 className="text-[11px] font-semibold text-secondary uppercase tracking-widest mb-2.5 flex items-center gap-2">
                <span className="material-symbols-outlined text-[15px]">code</span> 命令内容
              </h3>
              <div className="grid grid-cols-1 gap-3 bg-surface-dim p-3.5 rounded-xl border border-outline-variant/30">
                <div>
                  <label className="block text-[13px] text-on-surface-variant mb-1.5">Shell 命令</label>
                  <div className="relative">
                    <textarea
                      value={command}
                      onChange={(e) => setCommand(e.target.value)}
                      className="w-full px-3.5 py-2 rounded-xl bg-surface-container-low border-outline-variant text-on-surface text-terminal-mono font-terminal-mono placeholder:text-outline/60 focus:bg-surface-container focus:border-secondary focus:shadow-[0_0_0_2px_var(--secondary-glow)] transition-all text-[13px] resize-vertical min-h-[80px]"
                      placeholder="apt update && apt upgrade -y"
                      rows={3}
                    />
                  </div>
                </div>
              </div>
            </section>

            {/* 分类（可选） */}
            <section>
              <h3 className="text-[11px] font-semibold text-secondary uppercase tracking-widest mb-2.5 flex items-center gap-2">
                <span className="material-symbols-outlined text-[15px]">folder</span> 分类（可选）
              </h3>
              <div className="grid grid-cols-1 gap-3 bg-surface-dim p-3.5 rounded-xl border border-outline-variant/30">
                <div>
                  <label className="block text-[13px] text-on-surface-variant mb-1.5">分类名称</label>
                  <div className="relative">
                    <input
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="w-full px-3.5 py-2 rounded-xl bg-surface-container-low border-outline-variant text-on-surface placeholder:text-outline/60 text-[14px] focus:bg-surface-container focus:border-secondary focus:shadow-[0_0_0_2px_var(--secondary-glow)] transition-all"
                      placeholder="系统管理、数据库、网络..."
                      type="text"
                    />
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-outline-variant/20 flex justify-end gap-2.5 items-center shrink-0" style={{ background: "var(--surface-container)" }}>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-lg text-on-surface-variant hover:text-on-surface transition-colors text-[13px] font-medium"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={!isValid || saving}
            className="px-6 py-2 rounded-lg bg-secondary text-black font-semibold hover:bg-secondary/90 transition-all text-[13px] font-medium flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ boxShadow: "0 0 10px rgba(77, 224, 130, 0.25)" }}
          >
            <span className="material-symbols-outlined text-[16px]">check</span>
            保存
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
