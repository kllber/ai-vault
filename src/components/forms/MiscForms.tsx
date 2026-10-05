import { useState } from "react";
import { Boxes, FolderKanban, UserRound, RefreshCw, AlertTriangle, Info, Link2, Search, Plus } from "lucide-react";
import { Modal, PrimaryButton, GhostButton } from "@/components/ui/Modal";
import { Select, TextArea, TextField } from "@/components/ui/inputs";
import { allVendors, bindingsOfKey, getDB, keyVendor, projectKeys } from "@/data/db";
import { SOFTWARE_GROUPS, SOFTWARE_PRESETS } from "@/data/presets";
import { adapterFor } from "@/lib/adapters";
import { BrandIcon } from "@/components/BrandIcon";
import { RolePicker, VendorGlyph } from "@/components/bits";
import { ImagePickField } from "@/components/ui/ImagePick";
import type { Account, BindRole, Project, Software } from "@/data/types";
import { useVault } from "@/store/vault";
import { cn } from "@/lib/utils";

/* ------------------------------- 账号 ------------------------------- */
export function AccountForm({
  open,
  onClose,
  editing,
  presetVendorId,
}: {
  open: boolean;
  onClose: () => void;
  editing?: Account | null;
  presetVendorId?: string | null;
}) {
  const { addAccount, updateAccount } = useVault();
  const [vendorId, setVendorId] = useState(editing?.vendorId ?? presetVendorId ?? "");
  const [label, setLabel] = useState(editing?.label ?? "");
  const [login, setLogin] = useState(editing?.login ?? "");
  const [note, setNote] = useState(editing?.note ?? "");
  const [memberUntil, setMemberUntil] = useState(
    editing?.membershipExpiresAt ? editing.membershipExpiresAt.slice(0, 10) : "",
  );
  const [adminKey, setAdminKey] = useState(editing?.adminKey ?? "");
  const canSave = vendorId && label.trim();

  const save = () => {
    if (!canSave) return;
    const payload = {
      vendorId,
      label: label.trim(),
      login: login.trim(),
      note: note.trim(),
      membershipExpiresAt: memberUntil ? new Date(memberUntil).toISOString() : null,
      adminKey: adminKey.trim() || null,
    };
    if (editing) updateAccount(editing.id, payload);
    else addAccount(payload);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<span className="grid h-9 w-9 place-items-center rounded-xl bg-white/8 text-ink-100"><UserRound size={17} /></span>}
      title={editing ? "编辑账号" : "添加账号"}
      subtitle="同一厂商下可以有多个账号，每个账号可挂多把密钥"
      footer={
        <>
          <GhostButton onClick={onClose}>取消</GhostButton>
          <PrimaryButton onClick={save} disabled={!canSave}>
            {editing ? "保存" : "添加"}
          </PrimaryButton>
        </>
      }
    >
      <div className="space-y-3">
        <Select
          label="所属厂商"
          value={vendorId}
          onChange={setVendorId}
          placeholder="选择厂商"
          options={allVendors().map((v) => ({
            value: v.id,
            label: adapterFor(v.id)?.supportsBalance ? `${v.name}（可看余额）` : v.name,
          }))}
        />
        <TextField label="账号名称" value={label} onChange={setLabel} placeholder="如 个人主号 / 团队工作区" />
        <TextField label="登录方式" value={login} onChange={setLogin} placeholder="邮箱或手机号（仅作记录）" />
        {!adapterFor(vendorId)?.balanceVia &&
          (adapterFor(vendorId)?.supportsBalance ? (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/8 px-3 py-2.5 text-[11.5px] text-emerald-100">
              <RefreshCw size={12} className="flex-none" />
              该厂商支持自动查询余额：点顶部「刷新余额」即可，无需手填。
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-xl border border-white/8 bg-white/3 px-3 py-2.5 text-[11.5px] text-ink-400">
              <AlertTriangle size={12} className="flex-none text-amber-300" />
              该厂商无法用 API 查余额，软件不会显示余额；如需记录，请写在备注里。
            </div>
          ))}
        {adapterFor(vendorId)?.balanceVia === "cli" && (
          <div className="flex items-start gap-2 rounded-xl border border-white/10 bg-white/3 p-3 text-[11.5px] leading-relaxed text-ink-300">
            <Info size={13} className="mt-0.5 flex-none text-[#b9aaff]" />
            <span>
              <b className="text-ink-100">通义千问的花费通过官方 CLI 查询。</b>
              <br />
              先安装并登录：<code className="text-ink-100">npm i -g @qianwenai/qianwen-cli</code>
              ，再执行 <code className="text-ink-100">qianwen auth login</code> 完成浏览器授权。
              之后点顶部「刷新余额」即可看到本月花费（需本地服务）。
            </span>
          </div>
        )}
        {adapterFor(vendorId)?.balanceVia === "admin" && (
          <div className="space-y-3 rounded-xl border border-white/10 bg-white/3 p-3">
            <div className="flex items-start gap-2">
              <Info size={13} className="mt-0.5 flex-none text-[#b9aaff]" />
              <div className="text-[11.5px] leading-relaxed text-ink-300">
                <span className="font-medium text-ink-100">想看这家的花费吗？（可选）</span>
                <br />
                OpenAI / Anthropic 不提供"余额"接口，但如果你在它们的
                <b className="text-ink-100">组织后台</b>
                单独创建一个
                <b className="text-ink-100">管理密钥（Admin Key）</b>
                填在这里，软件就能查到
                <b className="text-ink-100">本月花费</b>。
                <br />
                <span className="text-ink-500">
                  它不是你现在填的 API Key，是两回事；不填也完全没问题，只是看不到花费。
                </span>
              </div>
            </div>
            <TextField
              label="管理密钥（Admin Key，可选）"
              value={adminKey}
              onChange={setAdminKey}
              masked
              mono
              placeholder="留空则不查询花费"
              hint="和 API Key 分开保存在本机，不会上传"
            />
          </div>
        )}

        <TextField
          label="会员 / 套餐到期日"
          value={memberUntil}
          onChange={setMemberUntil}
          type="date"
          hint="指订阅（Plus、编程套餐等）的续费日，不是 API key 的到期；留空表示无"
        />
        <TextArea label="备注" value={note} onChange={setNote} rows={2} placeholder="补充说明…" />
      </div>
    </Modal>
  );
}

/* ------------------------------- 软件 ------------------------------- */
const ACCENTS = ["#7c5cff", "#4d6bfe", "#35e6d0", "#10a37f", "#d97757", "#a855f7", "#ff5c9d", "#ffb35c"];

export function SoftwareForm({
  open,
  onClose,
  editing,
}: {
  open: boolean;
  onClose: () => void;
  editing?: Software | null;
}) {
  const { addSoftware, updateSoftware } = useVault();
  const [name, setName] = useState(editing?.name ?? "");
  const [category, setCategory] = useState(editing?.category ?? "");
  const [glyph, setGlyph] = useState(editing?.glyph ?? "");
  const [accent, setAccent] = useState(editing?.accent ?? ACCENTS[0]);
  const [icon, setIcon] = useState<string | null>(editing?.icon ?? null);
  const [logoData, setLogoData] = useState<string | null>(editing?.logoData ?? null);
  const canSave = name.trim();

  const save = () => {
    if (!canSave) return;
    const payload = {
      name: name.trim(),
      category: category.trim(),
      glyph: glyph.trim() || name.trim().slice(0, 1),
      accent,
      icon: icon ?? null,
      logoData: logoData ?? null,
    };
    if (editing) updateSoftware(editing.id, payload);
    else addSoftware(payload);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<span className="grid h-9 w-9 place-items-center rounded-xl bg-white/8 text-ink-100"><Boxes size={17} /></span>}
      title={editing ? "编辑软件" : "添加软件"}
      subtitle="软件＝谁在调用（如 Cursor、客服系统、某个脚本）"
      footer={
        <>
          <GhostButton onClick={onClose}>取消</GhostButton>
          <PrimaryButton onClick={save} disabled={!canSave}>
            {editing ? "保存" : "添加"}
          </PrimaryButton>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <span className="mb-1.5 block text-[12px] font-medium text-ink-300">
            快速选择（点一下自动填好名称 / 图标 / 颜色）
          </span>
          <div className="relative">
            <div className="no-scrollbar max-h-[168px] space-y-2 overflow-y-auto rounded-xl border border-white/8 bg-black/20 p-2.5 pb-6">
            {SOFTWARE_GROUPS.map((g) => {
              const items = SOFTWARE_PRESETS.filter((p) => p.group === g);
              if (!items.length) return null;
              return (
                <div key={g}>
                  <div className="mb-1 text-[10px] tracking-wider text-ink-500">{g}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {items.map((p) => (
                      <button
                        key={p.name}
                        type="button"
                        onClick={() => {
                          setName(p.name);
                          setGlyph(p.glyph);
                          setAccent(p.accent);
                          setCategory(p.category);
                          setIcon(p.icon ?? null);
                          setLogoData(null);
                        }}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11.5px] transition-colors",
                          name === p.name
                            ? "border-[#7c5cff]/60 bg-[#7c5cff]/15 text-white"
                            : "border-white/8 bg-white/4 text-ink-300 hover:bg-white/8 hover:text-white",
                        )}
                      >
                        <BrandIcon icon={p.icon} glyph={p.glyph} size={20} radius={6} color={p.accent} />
                        {p.name}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
            </div>
            {/* 滚动提示 */}
            <div className="pointer-events-none absolute right-0 bottom-0 left-0 h-9 rounded-b-xl bg-gradient-to-t from-[#0b0b13] via-[#0b0b13]/80 to-transparent" />
            <div className="pointer-events-none absolute bottom-1.5 left-1/2 -translate-x-1/2 rounded-full bg-black/55 px-2.5 py-0.5 text-[10px] text-ink-300">
              ↕ 滚动查看更多（共 {SOFTWARE_PRESETS.length} 个预设）
            </div>
          </div>
          <span className="mt-1 block text-[10.5px] text-ink-500">
            也可以不用预设，在下面手动填写自定义名称与图标，或上传图片
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <TextField label="软件名称" value={name} onChange={setName} placeholder="如 客服系统" />
          <TextField label="图标字符" value={glyph} onChange={(v) => setGlyph(v.slice(0, 2))} placeholder="1 个字符" />
        </div>
        <TextField label="类型 / 说明" value={category} onChange={setCategory} placeholder="如 自研 · Web 服务 / 代码编辑器" />
        <div>
          <span className="mb-1.5 block text-[12px] font-medium text-ink-300">主题色</span>
          <div className="flex flex-wrap gap-2">
            {ACCENTS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setAccent(c)}
                className={cn(
                  "h-8 w-8 rounded-lg transition-transform",
                  accent === c ? "scale-110 ring-2 ring-white/70" : "hover:scale-105",
                )}
                style={{ background: `${c}33`, boxShadow: `inset 0 0 0 1px ${c}` }}
              />
            ))}
          </div>
        </div>
        <ImagePickField
          label="自定义图标（可选）"
          value={logoData}
          onChange={setLogoData}
          hint="上传图片可拖动裁切，会替换上面的品牌图标"
        />
      </div>
    </Modal>
  );
}
export function ProjectForm({
  open,
  onClose,
  editing,
  presetSoftwareId,
}: {
  open: boolean;
  onClose: () => void;
  editing?: Project | null;
  presetSoftwareId?: string | null;
}) {
  const { addProject, updateProject, setKeyBindings } = useVault();
  const db = getDB();
  const [softwareId, setSoftwareId] = useState(editing?.softwareId ?? presetSoftwareId ?? "");
  const [name, setName] = useState(editing?.name ?? "");
  const [search, setSearch] = useState("");
  const canSave = softwareId && name.trim();

  const projectId = editing?.id ?? null;
  const bound = projectId ? projectKeys(projectId) : [];
  const boundIds = new Set(bound.map((b) => b.key.id));
  const q = search.trim().toLowerCase();
  const candidates = db.apiKeys.filter((k) => {
    if (boundIds.has(k.id)) return false;
    if (!q) return true;
    return (
      k.alias.toLowerCase().includes(q) ||
      (keyVendor(k)?.name ?? "").toLowerCase().includes(q)
    );
  });

  const rebind = (keyId: string, fn: (list: { projectId: string; role: BindRole }[]) => { projectId: string; role: BindRole }[]) => {
    if (!projectId) return;
    setKeyBindings(
      keyId,
      fn(bindingsOfKey(keyId).map((b) => ({ projectId: b.projectId, role: b.role }))),
    );
  };
  const bind = (keyId: string) =>
    rebind(keyId, (rest) => [
      ...rest.filter((b) => b.projectId !== projectId),
      { projectId: projectId as string, role: "primary" },
    ]);
  const unbind = (keyId: string) =>
    rebind(keyId, (rest) => rest.filter((b) => b.projectId !== projectId));
  const setRole = (keyId: string, role: BindRole) =>
    rebind(keyId, (rest) =>
      rest.map((b) => (b.projectId === projectId ? { projectId: b.projectId, role } : b)),
    );

  const save = () => {
    if (!canSave) return;
    if (editing) updateProject(editing.id, { softwareId, name: name.trim() });
    else addProject({ softwareId, name: name.trim() });
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      icon={<span className="grid h-9 w-9 place-items-center rounded-xl bg-white/8 text-ink-100"><FolderKanban size={17} /></span>}
      title={editing ? "编辑项目" : "添加项目"}
      subtitle="项目＝该软件里的哪个具体工程 / 工作区"
      footer={
        <>
          <GhostButton onClick={onClose}>取消</GhostButton>
          <PrimaryButton onClick={save} disabled={!canSave}>
            {editing ? "保存" : "添加"}
          </PrimaryButton>
        </>
      }
    >
      <div className="space-y-3">
        <Select
          label="所属软件"
          value={softwareId}
          onChange={setSoftwareId}
          placeholder="选择软件"
          options={db.softwares.map((s) => ({ value: s.id, label: s.name }))}
        />
        <TextField label="项目名称" value={name} onChange={setName} placeholder="如 后端重构 / 线上机器人" />

        <div className="hairline" />

        {projectId ? (
          <div>
            <div className="mb-2 flex items-center gap-2">
              <Link2 size={13} className="text-ink-400" />
              <span className="text-[11px] font-semibold tracking-wider text-ink-500 uppercase">
                已绑定的密钥
              </span>
              <span className="rounded-full bg-white/8 px-1.5 py-0.5 font-mono text-[10.5px] text-ink-300">
                {bound.length}
              </span>
              <span className="ml-auto text-[10.5px] text-ink-500">增删会立即生效</span>
            </div>

            <div className="space-y-1.5">
              {bound.map(({ key, binding, vendor }) => (
                <div
                  key={key.id}
                  className="flex items-center gap-2 rounded-xl border border-white/6 bg-black/20 px-3 py-2"
                >
                  {vendor && <VendorGlyph vendor={vendor} size={20} radius={6} />}
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-100">
                    {key.alias}
                  </span>
                  <RolePicker
                    value={binding.role}
                    onChange={(r) => (r ? setRole(key.id, r) : unbind(key.id))}
                  />
                </div>
              ))}
              {bound.length === 0 && (
                <div className="rounded-xl border border-dashed border-white/10 py-3 text-center text-[11.5px] text-ink-500">
                  还没有绑定密钥，从下面挑一个吧
                </div>
              )}
            </div>

            <div className="mt-3">
              <div className="mb-1.5 flex items-center gap-2 rounded-xl border border-white/10 bg-black/25 px-3 py-2">
                <Search size={13} className="flex-none text-ink-500" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="搜索要添加的密钥…"
                  className="flex-1 bg-transparent text-[12.5px] text-white placeholder:text-ink-500 focus:outline-none"
                />
              </div>
              <div className="no-scrollbar max-h-[168px] space-y-1 overflow-y-auto">
                {candidates.map((k) => {
                  const v = keyVendor(k);
                  return (
                    <button
                      key={k.id}
                      type="button"
                      onClick={() => bind(k.id)}
                      className="flex w-full items-center gap-2 rounded-lg border border-white/6 bg-white/3 px-2.5 py-2 text-left transition-colors hover:bg-white/8"
                    >
                      {v && <VendorGlyph vendor={v} size={20} radius={6} />}
                      <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-200">
                        {k.alias}
                      </span>
                      <span className="inline-flex flex-none items-center gap-1 text-[11px] text-[#c3b8ff]">
                        <Plus size={11} /> 添加为主用
                      </span>
                    </button>
                  );
                })}
                {candidates.length === 0 && (
                  <div className="py-3 text-center text-[11.5px] text-ink-500">
                    {bound.length === db.apiKeys.length ? "所有密钥都已绑定到本项目" : "没有匹配的密钥"}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <p className="text-[11.5px] leading-relaxed text-ink-500">
            保存后，重新打开这个项目就能在这里直接添加 / 解绑密钥（也可在「密钥」里设置）。
          </p>
        )}
      </div>
    </Modal>
  );
}
