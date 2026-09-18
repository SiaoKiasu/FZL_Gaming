-- 峡谷基金收支流水 + 一个极简的单条目设置表 (app_settings)，用来存放"填写
-- 流水"表单的密码哈希（只有喑糖浆知道明文，这里只存加盐哈希，见
-- src/lib/ledgerAuth.ts）。
--
-- 三条独立命令，如果 Neon 的 Query 工具提示 "cannot insert multiple
-- commands"，就分开一条条粘贴运行。

CREATE TABLE IF NOT EXISTS ledger_entries (
  id            SERIAL PRIMARY KEY,
  entry_date    DATE NOT NULL,
  type          TEXT NOT NULL,
  item          TEXT NOT NULL,
  income        NUMERIC(10, 2),
  expense       NUMERIC(10, 2),
  handler       TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app_settings (
  key           TEXT PRIMARY KEY,
  value         TEXT NOT NULL
);

-- 把 fund.ts 里原来写死的那一条历史记录（首月会费）迁移进来，保证切到
-- 数据库之后这条记录不会丢。只在表是空的时候插入，重复运行这个文件不
-- 会插入第二次。
INSERT INTO ledger_entries (entry_date, type, item, income, expense, handler)
SELECT '2026-09-01', '收入', '8 人首月会费', 240, NULL, '郑儿朗'
WHERE NOT EXISTS (SELECT 1 FROM ledger_entries);
