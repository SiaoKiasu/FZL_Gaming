"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const inputClass =
  "rounded-sm border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--gold)]";
const buttonClass =
  "font-display rounded-sm bg-[var(--gold)] px-5 py-2 text-sm font-bold text-[#0a0f1e] transition disabled:cursor-not-allowed disabled:opacity-50";

function LoginForm({ members, next }: { members: string[]; next: string }) {
  const router = useRouter();
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!nickname) return setError("先选一下你是谁");
    if (!password) return setError("填一下密码");
    setBusy(true);
    setError("");
    try {
      const resp = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname, password }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        setError(data.error ?? "登录失败");
        setBusy(false);
        return;
      }
      // refresh() re-runs the server components so the nav bar and every
      // page picks up the new session; push() then lands back where the
      // member was headed.
      router.push(next);
      router.refresh();
    } catch {
      setError("网络不太行，再试一次");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex max-w-sm flex-col gap-3">
      <select
        value={nickname}
        onChange={(e) => setNickname(e.target.value)}
        className={inputClass}
        disabled={busy}
      >
        <option value="">我是……</option>
        {members.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>

      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="密码"
        autoComplete="current-password"
        className={inputClass}
        disabled={busy}
      />

      {error ? <p className="text-sm text-[var(--status-critical)]">{error}</p> : null}

      <button type="submit" disabled={busy} className={`${buttonClass} self-start`}>
        {busy ? "登录中……" : "登录"}
      </button>

      <p className="text-xs text-[var(--muted)]">
        没有密码或者忘了？找管理员重新发一个。
      </p>
    </form>
  );
}

function AccountPanel({ member }: { member: string }) {
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (next.length < 6) return setError("新密码至少 6 位");
    if (next !== confirm) return setError("两次输入的新密码不一致");
    setBusy(true);
    setError("");
    setDone("");
    try {
      const resp = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        setError(data.error ?? "改密码失败");
      } else {
        setDone("密码改好了");
        setCurrent("");
        setNext("");
        setConfirm("");
      }
    } catch {
      setError("网络不太行，再试一次");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } catch {
      setBusy(false);
    }
  }

  return (
    <div className="flex max-w-sm flex-col gap-6">
      <div className="flex items-center gap-3">
        <p className="text-sm">
          当前身份：<span className="font-display text-[var(--gold)]">{member}</span>
        </p>
        <button
          type="button"
          onClick={logout}
          disabled={busy}
          className="rounded-sm border border-[var(--border)] px-3 py-1 text-xs transition hover:border-[var(--gold)] hover:text-[var(--gold)] disabled:opacity-50"
        >
          退出登录
        </button>
      </div>

      <form onSubmit={changePassword} className="flex flex-col gap-3">
        <h2 className="font-display text-lg font-bold">改密码</h2>
        <input
          type="password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          placeholder="当前密码"
          autoComplete="current-password"
          className={inputClass}
          disabled={busy}
        />
        <input
          type="password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          placeholder="新密码（至少 6 位）"
          autoComplete="new-password"
          className={inputClass}
          disabled={busy}
        />
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="再输一次新密码"
          autoComplete="new-password"
          className={inputClass}
          disabled={busy}
        />
        {error ? <p className="text-sm text-[var(--status-critical)]">{error}</p> : null}
        {done ? <p className="text-sm text-[var(--status-good)]">{done}</p> : null}
        <button type="submit" disabled={busy} className={`${buttonClass} self-start`}>
          {busy ? "处理中……" : "确认修改"}
        </button>
      </form>
    </div>
  );
}

export default function AuthPanel({
  member,
  members,
  next,
}: {
  member: string | null;
  members: string[];
  next: string;
}) {
  return member ? <AccountPanel member={member} /> : <LoginForm members={members} next={next} />;
}
