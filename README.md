# FZL Gaming

FZL Gaming 车队专属门户，基于 [Next.js](https://nextjs.org) 构建。

## 当前内容

- 首页：战队品牌展示 + 功能规划
- 选手名单页 (`/roster`)：8 位车队成员的位置与英雄池

## 功能规划

- 实时在线状态（接外部后端）
- 对局数据统计
- 视频 / 集锦上传

## 本地开发

```bash
npm install
npm run dev
```

打开 http://localhost:3000 查看效果。

## 目录结构

- `src/app` — 页面（App Router）
- `src/components` — 公共组件（导航栏等）
- `src/lib/roster.ts` — 选手数据（昵称 / 位置 / 英雄池 / 头像）
- `public/roster` — 选手头像
