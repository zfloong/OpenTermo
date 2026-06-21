import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { HostKeyPromptPayload } from "@/lib/tauriCommands";
import { replyHostKey } from "@/lib/tauriCommands";

interface HostKeyDialogProps {
  prompt: HostKeyPromptPayload;
  onClose: () => void;
}

export default function HostKeyDialog({ prompt, onClose }: HostKeyDialogProps) {
  const handleAccept = async () => {
    await replyHostKey(prompt.prompt_id, true);
    onClose();
  };

  const handleReject = async () => {
    await replyHostKey(prompt.prompt_id, false);
    onClose();
  };

  return (
    <Dialog open={true} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-[420px]">
        <DialogHeader>
          <DialogTitle className={prompt.changed ? "text-[var(--color-warning)]" : "text-[var(--text-heading)]"}>
            {prompt.changed ? "主机密钥已变更！" : "未知主机密钥"}
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-[var(--text-secondary)] -mt-1">
          {prompt.changed
            ? "服务器的主机密钥已变更，可能为中间人攻击。"
            : "无法验证该主机的真实性。"}
        </p>

        <div className="flex flex-col gap-1.5 p-3 bg-[var(--bg-base)] rounded-sm mt-1">
          <div className="flex justify-between text-xs">
            <span className="text-[var(--text-secondary)]">主机</span>
            <span className="text-[var(--text-primary)] font-mono">{prompt.host}:{prompt.port}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-[var(--text-secondary)]">密钥类型</span>
            <span className="text-[var(--text-primary)]">{prompt.key_type}</span>
          </div>
          <div className="flex flex-col gap-0.5 text-xs">
            <span className="text-[var(--text-secondary)]">指纹</span>
            <span className="text-[var(--text-primary)] font-mono break-all">{prompt.fingerprint}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 justify-end mt-2">
          <Button variant="outline" onClick={handleReject}>
            拒绝
          </Button>
          <Button variant="primary" onClick={handleAccept}>
            {prompt.changed ? "仍然接受" : "接受"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
