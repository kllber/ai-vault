import { useEffect, useMemo, useState } from "react";
import { KeyRound, ShieldCheck, Link2, RefreshCw, Wallet, ChevronDown, ChevronRight, Plus, Search, Info } from "lucide-react";
import { Modal, PrimaryButton, GhostButton } from "@/components/ui/Modal";
import {
  InlineAdd,
  SectionTitle,
  Segmented,
  Select,
  TagField,
  TextArea,
  TextField,
} from "@/components/ui/inputs";
import { allVendors, getDB, paletteFor, ringFor } from "@/data/db";
import type { ApiKey, BindRole, KeyStatus } from "@/data/types";
import { adapterFor, DEFAULT_BASE } from "@/lib/adapters";
import { SoftGlyph, RolePicker } from "@/components/bits";
import { ImagePickField } from "@/components/ui/ImagePick";
import { useVault } from "@/store/vault";
import { maskKey } from "@/lib/utils";

const STATUS_OPTIONS: { value: KeyStatus; label: string }[] = [
  { value: "active", label: "有效" },
  { value: "expiring", label: "即将过期" },
  { value: "invalid", label: "已失效" },
  { value: "unchecked", label: "待检测" },
];

export function KeyForm({
  open,
  onClose,
  editing,
  presetAccountId,
}: {
  open: boolean;
  onClose: () => void;
  editing?: ApiKey | null;
  presetAccountId?: string | null;
}) {
  const { addKey, updateKey, setKeyBindings, addVendor, addAccount, addSoftware, addProject, updateAccount } = useVault();
  const db = getDB();

  const [vendorId, setVendorId] = useState(
    editing ? (db.accounts.find((a) => a.id === editing.accountId)?.vendorId ?? "") : "",
  );
  const [accountId, setAccountId] = useState(editing?.accountId ?? presetAccountId ?? "");
  const [alias, setAlias] = useState(editing?.alias ?? "");
  const [secret, setSecret] = useState("");
  const [baseUrl, setBaseUrl] = useState(editing?.baseUrl ?? "");
  const [baseUrlTouched, setBaseUrlTouched] = useState(Boolean(editing?.baseUrl));
  const [status, setStatus] = useState<KeyStatus>(editing?.status ?? "active");
  const [tags, setTags] = useState<string[]>(editing?.tags ?? []);
  const [note, setNote] = useState(editing?.note ?? "");

  const [bindings, setBindings] = useState<Record<string, BindRole>>(() => {
    const map: Record<string, BindRole> = {};
    if (editing) {
      for (const b of db.bindings.filter((x) => x.keyId === editing.id)) map[b.projectId] = b.role;
    }
    return map;
  });

  // 新建厂商 / 新建账号 的内联表单
  const [newVendor, setNewVendor] = useState<null | { name: string; short: string; glyph: string; region: "海外" | "国内" }>(null);
  const [newVendorLogo, setNewVendorLogo] = useState<string | null>(null);
  const [newAccount, setNewAccount] = useState<null | { label: string; login: string }>(null);

  // OpenAI / Anthropic：可选的管理密钥（查花费）
  const supportsSpend = adapterFor(vendorId)?.balanceVia === "admin";
  const [adminKey, setAdminKey] = useState("");
  const [memberUntil, setMemberUntil] = useState("");
  useEffect(() => {
    const acc = getDB().accounts.find((a) => a.id === accountId);
    setAdminKey(acc?.adminKey ?? "");
    setMemberUntil(acc?.membershipExpiresAt ? acc.membershipExpiresAt.slice(0, 10) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  // 绑定区：折叠 / 搜索 / 内联新建
  const [bindOpen, setBindOpen] = useState(false);
  const [bindQuery, setBindQuery] = useState("");
  const [newSoftwareOpen, setNewSoftwareOpen] = useState(false);
  const [newSoftwareName, setNewSoftwareName] = useState("");
  const [newProjectFor, setNewProjectFor] = useState<string | null>(null);
  const [newProjectName, setNewProjectName] = useState("");

  const vendorAccounts = useMemo(
    () => db.accounts.filter((a) => a.vendorId === vendorId),
    [db.accounts, vendorId],
  );

  const filteredSoftware = useMemo(() => {
    const q = bindQuery.trim().toLowerCase();
    return db.softwares
      .map((sw) => {
        const all = db.projects.filter((p) => p.softwareId === sw.id);
        const swHit = !q || sw.name.toLowerCase().includes(q) || sw.category.toLowerCase().includes(q);
        const projs = swHit ? all : all.filter((p) => p.name.toLowerCase().includes(q));
        return { sw, projs, hide: !!q && !swHit && projs.length === 0 };
      })
      .filter((x) => !x.hide);
  }, [db.softwares, db.projects, bindQuery]);

  const bindCount = Object.keys(bindings).length;

  // 选了厂商就自动填入它的官方 Base URL；该厂商没有默认地址则清空（避免残留上一个厂商的地址）
  useEffect(() => {
    if (!vendorId || baseUrlTouched) return;
    setBaseUrl(DEFAULT_BASE[vendorId] ?? "");
  }, [vendorId, baseUrlTouched]);

  const createSoftware = () => {
    const name = newSoftwareName.trim();
    if (!name) return;
    const id = addSoftware({ name, category: "", glyph: name.slice(0, 1), accent: "#7c5cff" });
    setNewSoftwareName("");
    setNewSoftwareOpen(false);
    setBindQuery("");
    setNewProjectFor(id);
    setNewProjectName("");
  };

  const createProject = () => {
    const name = newProjectName.trim();
    if (!newProjectFor || !name) return;
    addProject({ softwareId: newProjectFor, name });
    setNewProjectName("");
    setBindQuery("");
    setNewProjectFor(null);
  };

  const canSave = vendorId && accountId && alias.trim() && (editing || secret.trim());

  const save = () => {
    if (!canSave) return;
    const rawAlias = alias.trim();
    const finalAlias = rawAlias && !/-key$/i.test(rawAlias) ? `${rawAlias}-key` : rawAlias;
    const payload = {
      accountId,
      alias: finalAlias,
      secret: secret.trim() || editing?.secret || "",
      status,
      tags,
      baseUrl: baseUrl.trim(),
      note: note.trim(),
    };
    const nextBindings = Object.entries(bindings).map(([projectId, role]) => ({ projectId, role }));
    if (editing) {
      updateKey(editing.id, payload);
      setKeyBindings(editing.id, nextBindings);
    } else {
      const id = addKey(payload);
      setKeyBindings(id, nextBindings);
    }
    // OpenAI / Anthropic：可选的管理密钥；账号的会员/余额到期日
    if (accountId) {
      const patch: { membershipExpiresAt: string | null; adminKey?: string | null } = {
        membershipExpiresAt: memberUntil ? new Date(memberUntil).toISOString() : null,
      };
      if (supportsSpend) patch.adminKey = adminKey.trim() || null;
      updateAccount(accountId, patch);
    }
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      icon={
        <span
          className="grid h-9 w-9 place-items-center rounded-xl text-white"
          style={{ background: "linear-gradient(140deg,#7c5cff,#35e6d0)" }}
        >
          <KeyRound size={17} />
        </span>
      }
      title={editing ? "编辑密钥" : "添加密钥"}
      subtitle="密钥值加密后保存在本机，明文不会上传"
      footer={
        <>
          <GhostButton onClick={onClose}>取消</GhostButton>
          <PrimaryButton onClick={save} disabled={!canSave}>
            {editing ? "保存修改" : "添加密钥"}
          </PrimaryButton>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <SectionTitle>归属</SectionTitle>
          <div className="space-y-3">
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Select
                  label="厂商"
                  value={vendorId}
                  onChange={(v) => {
                    setVendorId(v);
                    setAccountId("");
                  }}
                  placeholder="选择厂商"
                  options={allVendors().map((v) => ({
                    value: v.id,
                    label: adapterFor(v.id)?.supportsBalance ? `${v.name}（可看余额）` : v.name,
                  }))}
                />
              </div>
              <div className="pb-1">
                <InlineAdd
                  label="新建厂商"
                  onClick={() =>
                    setNewVendor({ name: "", short: "", glyph: "", region: "国内" })
                  }
                />
              </div>
            </div>

            {newVendor && (
              <div className="glass-soft space-y-3 rounded-xl p-3">
                <div className="grid grid-cols-2 gap-3">
                  <TextField
                    label="厂商名称"
                    value={newVendor.name}
                    onChange={(v) => setNewVendor({ ...newVendor, name: v })}
                    placeholder="如 通义千问"
                  />
                  <TextField
                    label="简介 / 型号"
                    value={newVendor.short}
                    onChange={(v) => setNewVendor({ ...newVendor, short: v })}
                    placeholder="如 Qwen-Max"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <TextField
                    label="图标字符"
                    value={newVendor.glyph}
                    onChange={(v) => setNewVendor({ ...newVendor, glyph: v.slice(0, 2) })}
                    placeholder="1 个字母或汉字"
                  />
                  <Segmented
                    label="地区"
                    value={newVendor.region}
                    onChange={(v) => setNewVendor({ ...newVendor, region: v })}
                    options={[
                      { value: "国内", label: "国内" },
                      { value: "海外", label: "海外" },
                    ]}
                  />
                </div>
                <ImagePickField
                  label="自定义图标（可选）"
                  value={newVendorLogo}
                  onChange={setNewVendorLogo}
                  hint="上传图片可拖动裁切"
                />
                <div className="flex justify-end gap-2">
                  <GhostButton onClick={() => setNewVendor(null)}>取消</GhostButton>
                  <PrimaryButton
                    disabled={!newVendor.name.trim()}
                    onClick={() => {
                      const name = newVendor.name.trim();
                      const id = addVendor({
                        name,
                        short: newVendor.short.trim(),
                        glyph: newVendor.glyph.trim() || name.slice(0, 1).toUpperCase(),
                        gradient: paletteFor(name),
                        ring: ringFor(name),
                        region: newVendor.region,
                        logoData: newVendorLogo,
                      });
                      setVendorId(id);
                      setAccountId("");
                      setNewVendor(null);
                      setNewVendorLogo(null);
                    }}
                  >
                    创建厂商
                  </PrimaryButton>
                </div>
              </div>
            )}

            {vendorId && (
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Select
                    label="所属账号"
                    value={accountId}
                    onChange={setAccountId}
                    placeholder={vendorAccounts.length ? "选择账号" : "该厂商下暂无账号，请新建"}
                    options={vendorAccounts.map((a) => ({
                      value: a.id,
                      label: a.label + (a.login ? ` · ${a.login}` : ""),
                    }))}
                  />
                </div>
                <div className="pb-1">
                  <InlineAdd
                    label="新建账号"
                    onClick={() => setNewAccount({ label: "", login: "" })}
                  />
                </div>
              </div>
            )}

            {newAccount && vendorId && (
              <div className="glass-soft space-y-3 rounded-xl p-3">
                <div className="grid grid-cols-2 gap-3">
                  <TextField
                    label="账号名称"
                    value={newAccount.label}
                    onChange={(v) => setNewAccount({ ...newAccount, label: v })}
                    placeholder="如 个人主号"
                  />
                  <TextField
                    label="登录方式"
                    value={newAccount.login}
                    onChange={(v) => setNewAccount({ ...newAccount, login: v })}
                    placeholder="邮箱 / 手机号"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <GhostButton onClick={() => setNewAccount(null)}>取消</GhostButton>
                  <PrimaryButton
                    disabled={!newAccount.label.trim()}
                    onClick={() => {
                      const id = addAccount({
                        vendorId,
                        label: newAccount.label.trim(),
                        login: newAccount.login.trim(),
                        note: "",
                      });
                      setAccountId(id);
                      setNewAccount(null);
                    }}
                  >
                    创建账号
                  </PrimaryButton>
                </div>
              </div>
            )}

            {supportsSpend && vendorId && (
              <div className="space-y-3 rounded-xl border border-white/10 bg-white/3 p-3">
                <div className="flex items-start gap-2">
                  <Info size={13} className="mt-0.5 flex-none text-[#b9aaff]" />
                  <div className="text-[11.5px] leading-relaxed text-ink-300">
                    <span className="font-medium text-ink-100">
                      想看这家的花费吗？（可选）
                    </span>
                    <br />
                    OpenAI / Anthropic 没有"余额"接口。如果你在它们的
                    <b className="text-ink-100">组织后台</b>
                    单独创建一个
                    <b className="text-ink-100">管理密钥（Admin Key）</b>
                    填在这里，软件就能查到
                    <b className="text-ink-100">本月花费</b>。
                    <span className="text-ink-500">
                      {" "}
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
                  hint="和 API Key 分开保存在本机（属于该账号）"
                />
                {!accountId && (
                  <div className="text-[10.5px] text-amber-300">
                    请先在上面选择或新建账号，管理密钥才会保存到该账号。
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="hairline" />

        <div>
          <SectionTitle>密钥</SectionTitle>
          <div className="space-y-3">
            <TextField
              label="别名（方便区分）"
              value={alias}
              onChange={setAlias}
              placeholder="如 DS-批量脚本"
              suffix="-key"
              hint="保存时会自动在名字后加上 -key，方便和项目名区分"
            />
            <TextField
              label="密钥值"
              value={secret}
              onChange={setSecret}
              mono
              masked
              placeholder={editing ? `留空则不修改（当前 ${maskKey(editing.secret)}）` : "粘贴 API Key"}
              hint="仅在本机加密保存；不会写入任何服务器"
            />
            {vendorId && adapterFor(vendorId) && adapterFor(vendorId)!.balanceVia !== "admin" && (
              <div className="flex items-start gap-2 rounded-xl border border-white/6 bg-white/3 px-3 py-2 text-[11.5px] text-ink-400">
                <RefreshCw size={12} className="mt-0.5 flex-none text-[#35e6d0]" />
                <span>
                  {adapterFor(vendorId)!.balanceVia === "cli"
                    ? "花费通过千问官方 CLI 查询：需先安装并登录 qianwen CLI（见「设置 → 千问 CLI」），且需本地服务"
                    : adapterFor(vendorId)!.supportsBalance
                      ? "该厂商支持自动查询余额（需本地服务）"
                      : "该厂商无法用 API 查余额，只能检测有效性"}
                </span>
              </div>
            )}
            <TextField
              label="Base URL"
              value={baseUrl}
              onChange={(v) => {
                setBaseUrl(v);
                setBaseUrlTouched(true);
              }}
              mono
              placeholder="https://api.example.com/v1"
              hint={
                vendorId && DEFAULT_BASE[vendorId]
                  ? "已按所选厂商自动填入官方地址 —— 官方直连不用改，只有用中转 / 代理站时才需要修改"
                  : "该厂商没有默认地址，请自行填写（或留空）"
              }
            />
            <TextField
              label="会员 / 余额到期日（可选）"
              value={memberUntil}
              onChange={setMemberUntil}
              type="date"
              hint="记在「账号」上：订阅续费日，或厂商赠送余额的到期日（同一账号下所有 key 共用）"
            />
            <div className="flex items-center gap-2 rounded-xl border border-white/6 bg-white/3 px-3 py-2 text-[11.5px] text-ink-400">
              <Wallet size={12} className="flex-none text-[#b9aaff]" />
              余额属于「账号」，由账号统一管理；该账号下所有 key 共享同一个余额。
            </div>
            <Segmented
              label="状态"
              value={status}
              onChange={setStatus}
              options={STATUS_OPTIONS}
            />
            <TagField label="标签" value={tags} onChange={setTags} />
            <TextArea label="备注" value={note} onChange={setNote} rows={2} placeholder="补充说明…" />
          </div>
        </div>

        <div className="hairline" />

        <div>
          <button
            type="button"
            onClick={() => setBindOpen((o) => !o)}
            className="flex w-full items-center gap-2 rounded-xl border border-white/8 bg-white/3 px-3 py-2.5 text-left transition-colors hover:bg-white/6"
          >
            {bindOpen ? (
              <ChevronDown size={14} className="flex-none text-ink-400" />
            ) : (
              <ChevronRight size={14} className="flex-none text-ink-400" />
            )}
            <Link2 size={13} className="flex-none text-ink-400" />
            <span className="flex-1 text-[12.5px] font-medium text-ink-200">绑定到软件 / 项目</span>
            <span className="text-[11px] text-ink-500">
              {bindCount > 0 ? `已绑定 ${bindCount} 处` : "未绑定"}
            </span>
          </button>

          {bindOpen && (
            <div className="mt-2 space-y-2">
              <div className="flex items-center gap-2">
                <div className="flex flex-1 items-center gap-2 rounded-xl border border-white/10 bg-black/25 px-3 py-2">
                  <Search size={13} className="flex-none text-ink-500" />
                  <input
                    value={bindQuery}
                    onChange={(e) => setBindQuery(e.target.value)}
                    placeholder="搜索软件或项目…"
                    className="flex-1 bg-transparent text-[12.5px] text-white placeholder:text-ink-500 focus:outline-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setNewSoftwareOpen((o) => !o)}
                  className="inline-flex flex-none items-center gap-1.5 rounded-lg border border-dashed border-white/15 px-2.5 py-2 text-[12px] text-ink-300 transition-colors hover:border-[#7c5cff]/60 hover:text-white"
                >
                  <Plus size={12} /> 新建软件
                </button>
              </div>

              {newSoftwareOpen && (
                <div className="glass-soft flex items-center gap-2 rounded-xl p-2.5">
                  <input
                    value={newSoftwareName}
                    onChange={(e) => setNewSoftwareName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), createSoftware())}
                    autoFocus
                    placeholder="软件名称，如 Cursor / 客服系统"
                    className="flex-1 rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-[12.5px] text-white placeholder:text-ink-500 focus:border-[#7c5cff]/70 focus:outline-none"
                  />
                  <GhostButton onClick={createSoftware}>创建</GhostButton>
                </div>
              )}

              {filteredSoftware.length === 0 ? (
                <div className="rounded-xl border border-dashed border-white/10 py-4 text-center text-[12px] text-ink-500">
                  没有匹配的软件 / 项目，可点上方「新建软件」
                </div>
              ) : (
                filteredSoftware.map(({ sw, projs }) => (
                  <div key={sw.id} className="glass-soft rounded-xl p-3">
                    <div className="mb-2 flex items-center gap-2">
                      <SoftGlyph software={sw} size={20} radius={6} />
                      <span className="flex-1 truncate text-[12.5px] font-medium text-ink-100">
                        {sw.name}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setNewProjectFor((cur) => (cur === sw.id ? null : sw.id));
                          setNewProjectName("");
                        }}
                        className="inline-flex flex-none items-center gap-1 rounded-md border border-dashed border-white/15 px-2 py-1 text-[11px] text-ink-400 transition-colors hover:border-[#7c5cff]/60 hover:text-white"
                      >
                        <Plus size={10} /> 项目
                      </button>
                    </div>

                    {newProjectFor === sw.id && (
                      <div className="mb-2 flex items-center gap-2">
                        <input
                          value={newProjectName}
                          onChange={(e) => setNewProjectName(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), createProject())}
                          autoFocus
                          placeholder="项目名称，如 后端重构"
                          className="flex-1 rounded-lg border border-white/10 bg-black/25 px-3 py-1.5 text-[12px] text-white placeholder:text-ink-500 focus:border-[#7c5cff]/70 focus:outline-none"
                        />
                        <GhostButton onClick={createProject} className="px-3 py-1.5 text-[11.5px]">
                          创建
                        </GhostButton>
                      </div>
                    )}

                    <div className="space-y-1.5">
                      {projs.map((p) => (
                        <div key={p.id} className="flex items-center gap-2">
                          <span className="flex-1 truncate text-[12.5px] text-ink-300">{p.name}</span>
                          <RolePicker
                            value={bindings[p.id]}
                            onChange={(role) =>
                              setBindings((prev) => {
                                const next = { ...prev };
                                if (role) next[p.id] = role;
                                else delete next[p.id];
                                return next;
                              })
                            }
                          />
                        </div>
                      ))}
                      {projs.length === 0 && (
                        <div className="text-[11.5px] text-ink-500">暂无项目，点上方「项目」新建</div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 rounded-xl border border-white/6 bg-white/3 px-3 py-2.5 text-[11.5px] text-ink-400">
          <ShieldCheck size={13} className="flex-none text-[#35e6d0]" />
          复制密钥后 30 秒会自动清空剪贴板；无操作超过 10 分钟自动锁定。
        </div>
      </div>
    </Modal>
  );
}
