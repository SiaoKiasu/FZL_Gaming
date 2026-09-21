# FZL Gaming

FZL Gaming 车队专属门户，基于 [Next.js](https://nextjs.org) 构建。

## 当前内容

- 首页：战队品牌展示 + 各功能入口
- 选手名单页 (`/roster`)：8 位车队成员的位置与英雄池
- 战绩 (`/matches`)：同步全队排位对局，含评分与详细数据
- 峡谷基金 (`/fund`)：奖金规则、收支流水
- 赛程 (`/schedule`)：每日开黑预约
- 视频 (`/videos`)：集锦上传 + 全队打分评论

## 功能规划

- 实时在线状态（接外部后端）

## 本地开发

```bash
npm install
npm run dev
```

打开 http://localhost:3000 查看效果。

## 环境变量

数据库（Vercel 面板接好 Postgres 后自动注入）：

- `POSTGRES_URL` 等 — 由 Vercel 的 Storage 自动配置

需手动在 Vercel → Settings → Environment Variables 添加（Production 和
Preview 都要勾）：

账号系统：

- `SESSION_SECRET` — 会话 cookie 的签名密钥，随便一串足够长的随机字符即可
  （例如 `openssl rand -base64 32`）。换掉它等于把所有人踢下线。
- `AUTH_ADMIN_PASSWORD` — 管理员口令，用于给成员设置 / 重置初始密码

视频存储：

- `COS_SECRET_ID` / `COS_SECRET_KEY` — 腾讯云 CAM 子账号密钥，权限只给视频桶
- `COS_BUCKET` — 存储桶名，形如 `fzl-video-1300000000`
- `COS_REGION` — `ap-hongkong`

> 改完环境变量必须重新部署一次才生效（别勾 Build Cache）。

## 账号

没有注册流程，8 个成员在 `src/lib/roster.ts` 里是固定的。管理员这样给某人
设初始密码（或在对方忘记密码时重置）：

```bash
curl -X POST https://你的域名/api/auth/admin/set-password \
  -H "Content-Type: application/json" \
  -d '{"adminPassword":"<AUTH_ADMIN_PASSWORD>","nickname":"<昵称>","password":"<初始密码>"}'
```

把初始密码私下发给本人，对方登录后在 `/login` 页自行修改。

身份只来自服务端会话：打分、评论、报名、记账的"是谁做的"全部取自登录态，
请求体里写别人的名字不会生效。

## 数据库迁移

`db/` 下的 `schema*.sql` 各跑一次即可（Vercel → Storage → Postgres → Query）。
按文件名对应：视频功能是 `db/schema_video.sql`，账号是 `db/schema_auth.sql`。

`db/seed_*.sql` 是本地调试假数据，**不要在生产库跑**。

## 目录结构

- `src/app` — 页面（App Router）
- `src/components` — 公共组件（导航栏等）
- `src/lib/roster.ts` — 选手数据（昵称 / 位置 / 英雄池 / 头像）
- `src/lib/cos.ts` — 腾讯云 COS 签名（视频存储在香港节点，见文件头注释）
- `src/lib/session.ts` — 签名 cookie 会话，`getCurrentMember()` 是全站唯一的身份来源
- `public/roster` — 选手头像
