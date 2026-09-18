"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const LEDGER_TYPES = ["收入", "设备支出", "奖金支出", "其他"] as const;

const inputClass =
  "rounded-sm border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--gold)]";
const buttonClass =
  "font-display rounded-sm bg-[var(--gold)] px-5 py-2 text-sm font-bold text-[#0a0f1e] transition disabled:cursor-not-allowed disabled:opacity-50";

export default function LedgerForm({
  passwordSet,
  initialDate,
}: {
  passwordSet: boolean;
  initialDate: string;
}) {
  const router = useRouter();

  // ---- one-time setup: whoever opens this first while no password is set
  // yet claims it. Meant to be 喑糖浆, opening this page himself -- the
  // password is never echoed back or logged anywhere, only its hash is
  // stored, so the site owner has no way to see it through normal use. ----
  const [setupPassword, setSetupPassword] = useState("");
  const [setupConfirm, setSetupConfirm] = useState("");
  const [setupStatus, setSetupStatus] = useState<"idle" | "loading" | "error">("idle");
  const [setupError, setSetupError] = useState("");

  async function handleSetup(e: React.FormEvent) {
    e.preventDefault();
    if (setupPassword.length < 4) {
      setSetupError("密码至少 4 位");
      setSetupStatus("error");
      return;
    }
    if (setupPassword !== setupConfirm) {
      setSetupError("两次输入的密码不一致");
      setSetupStatus("error");
      return;
    }
    setSetupStatus("loading");
    setSetupError("");
    try {
      const resp = await fetch("/api/fund/ledger/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: setupPassword }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        setSetupError(data.error ?? "设置失败");
        setSetupStatus("error");
        return;
      }
      setSetupPassword("");
      setSetupConfirm("");
      router.refresh();
    } catch {
      setSetupError("网络错误，请重试");
      setSetupStatus("error");
    }
  }

  // ---- normal entry form ----
  const [password, setPassword] = useState("");
  const [date, setDate] = useState(initialDate);
  const [type, setType] = useState<string>("收入");
  const [item, setItem] = useState("");
  const [amount, setAmount] = useState("");
  const [handler, setHandler] = useState("郑儿朗");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setError("");
    try {
      const resp = await fetch("/api/fund/ledger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, date, type, item, amount, handler }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        setError(data.error ?? "提交失败");
        setStatus("error");
        return;
      }
      setStatus("done");
      setPassword("");
      setItem("");
      setAmount("");
      router.refresh();
    } catch {
      setError("网络错误，请重试");
      setStatus("error");
    }
  }

  // ---- change password (collapsed by default) ----
  const [showChangePw, setShowChangePw] = useState(false);
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [pwStatus, setPwStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [pwError, setPwError] = useState("");

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwStatus("loading");
    setPwError("");
    try {
      const resp = await fetch("/api/fund/ledger/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldPassword: oldPw, newPassword: newPw }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        setPwError(data.error ?? "修改失败");
        setPwStatus("error");
        return;
      }
      setPwStatus("done");
      setOldPw("");
      setNewPw("");
    } catch {
      setPwError("网络错误，请重试");
      setPwStatus("error");
    }
  }

  if (!passwordSet) {
    return (
      <div className="rounded-sm border border-[var(--border)] bg-[var(--bg-panel)] p-5">
        <p className="font-display text-sm font-semibold uppercase tracking-wider text-[var(--gold)]">
          首次设置
        </p>
        <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">
          还没人设置过流水密码，这一步只需要做一次——设置之后这里会变成「填写流水」表单，每次提交都要输
          密码。密码只有设置的人自己知道，不会被记录或显示在任何地方，包括给网站所有者看。
        </p>
        <form onSubmit={handleSetup} className="mt-4 grid gap-3 sm:grid-cols-3">
          <input
            type="password"
            value={setupPassword}
            onChange={(e) => setSetupPassword(e.target.value)}
            placeholder="设一个只有你自己知道的密码"
            className={inputClass}
            autoComplete="new-password"
          />
          <input
            type="password"
            value={setupConfirm}
            onChange={(e) => setSetupConfirm(e.target.value)}
            placeholder="再输一遍确认"
            className={inputClass}
            autoComplete="new-password"
          />
          <button type="submit" disabled={setupStatus === "loading"} className={buttonClass}>
            {setupStatus === "loading" ? "设置中…" : "设置密码"}
          </button>
        </form>
        {setupStatus === "error" ? (
          <p className="mt-2 text-xs text-[var(--status-critical)]">{setupError}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="rounded-sm border border-[var(--border)] bg-[var(--bg-panel)] p-5">
      <p className="font-display text-sm font-semibold uppercase tracking-wider text-[var(--gold)]">
        填写流水
      </p>
      <form onSubmit={handleSubmit} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} required />
        <select value={type} onChange={(e) => setType(e.target.value)} className={inputClass}>
          {LEDGER_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <input
          type="text"
          value={item}
          onChange={(e) => setItem(e.target.value)}
          placeholder="事项"
          className={inputClass}
          required
        />
        <input
          type="number"
          min="0.01"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="金额"
          className={inputClass}
          required
        />
        <input
          type="text"
          value={handler}
          onChange={(e) => setHandler(e.target.value)}
          placeholder="经手人"
          className={inputClass}
          required
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="密码"
          className={inputClass}
          autoComplete="current-password"
          required
        />
        <button
          type="submit"
          disabled={status === "loading"}
          className={`${buttonClass} sm:col-span-2 lg:col-span-3`}
        >
          {status === "loading" ? "提交中…" : "记一笔"}
        </button>
      </form>
      {status === "error" ? <p className="mt-2 text-xs text-[var(--status-critical)]">{error}</p> : null}
      {status === "done" ? <p className="mt-2 text-xs text-[var(--status-good)]">已记录</p> : null}

      <button
        type="button"
        onClick={() => setShowChangePw((v) => !v)}
        className="mt-4 text-xs text-[var(--muted)] underline decoration-dotted underline-offset-2 hover:text-[var(--foreground)]"
      >
        {showChangePw ? "收起" : "修改密码"}
      </button>
      {showChangePw ? (
        <form onSubmit={handleChangePassword} className="mt-3 grid gap-2 sm:grid-cols-3">
          <input
            type="password"
            value={oldPw}
            onChange={(e) => setOldPw(e.target.value)}
            placeholder="当前密码"
            className={inputClass}
            autoComplete="current-password"
          />
          <input
            type="password"
            value={newPw}
            onChange={(e) => setNewPw(e.target.value)}
            placeholder="新密码"
            className={inputClass}
            autoComplete="new-password"
          />
          <button type="submit" disabled={pwStatus === "loading"} className={buttonClass}>
            {pwStatus === "loading" ? "修改中…" : "修改密码"}
          </button>
        </form>
      ) : null}
      {pwStatus === "error" ? <p className="mt-2 text-xs text-[var(--status-critical)]">{pwError}</p> : null}
      {pwStatus === "done" ? <p className="mt-2 text-xs text-[var(--status-good)]">密码已修改</p> : null}
    </div>
  );
}
