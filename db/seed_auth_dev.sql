-- ============================================================
-- FZL Gaming — 本地调试账号
-- ============================================================
-- 给 roster 里 8 个人都设上同一个密码，方便本地切换身份测试各种
-- "只能操作自己的"行为。
--
-- 密码统一是：fzl12345
--
-- 前置：先跑 db/schema_auth.sql。
-- 运行：psql "$POSTGRES_URL" -f db/seed_auth_dev.sql
--
-- 【警告】只对本地 / 自己的测试库执行。线上的初始密码要通过
-- /api/auth/admin/set-password 逐个设置并私下发给本人，不要用这份。
-- ============================================================

INSERT INTO members (nickname, password_hash) VALUES
  ('只怪我更爱自己', '1ce10b3b0cb7b3411466726c8240d251:3e8a50e20bc003d41d605ecc5c33025f4e0211a74ebe5d75bd9232a6bd899485b84c91a9ad80a6573855367086ecbc8ba889e484353246ceb3c280e6c743e906'),
  ('讨好冷漠', '29db927ac4bb1be40d03c440286bf76b:2c8096a72ddfb2c447362c5729f9c686c23780ecab092b8cfc8cffd1dd5295db07fbf90e44d5bf8d1acbb20909c260301c2e808ff80afaccdde106925876b9e5'),
  ('很遗憾不是吗', '7348d7deba6d2e5c28da78a3d6c43729:b62eb226e75c1af0e5e501fef017af7727f326fe0323fc7209aabbf6443aa67d69d297b27abf9a1c2d3e24b8d01e66e5d39fbc8ac3ebd974f709f57612dca418'),
  ('他一定比我更温柔', 'c72e409428228631a8f728b24cf0e7bb:a62121b90f692cef2e931f0ef7da521f6a4d0da1d567475f4445c436695e33d15e60f2cf2302df149f8ebd4441dcee0d39bd6ef9bffcb10dfc0dabae03050fa0'),
  ('变成光守护嘉然然', 'b268831e6db613235cb28cbe45155264:eda6bb13765c74425d51fe8c601defeab8ab50e045a85deed8a294ed1d264c59cfd1fd55d692556c6ee4921ba5f0e3f6b38aab4b1e52bae4c13e1316c10610af'),
  ('喑糖浆', 'ac997c626fe663d34d98178c9018986b:c21be7137132556f90b422f9611bb3e9487e6682e377847de0846c13a16cb7e4d46623e49028249acc89662937072b5c57ce54418f706b611acce070800fea24'),
  ('爱人要错过', '73fd21c3f5e465460eba05725cfbaf60:592a35c58eb7b77fa72a2a5f62c159e166ce07e6b42c452ec62961874ee2d5744677c7928a1cff8ea846ad6318e053ab435bed0f16157fbb3f578b2fa390fc9c'),
  ('e说句爱我好吗', '64d99e8321aaa17ba493815bfb5dace7:6b319b7f6c27a74d98f4946ac16f6e7bf04afc433aba18102d5c0b20cc99d73c77ea794602e2375f5160c258ede5a6e95d7d3d9cc4f885f09091743ba3c53579')
ON CONFLICT (nickname) DO UPDATE SET password_hash = EXCLUDED.password_hash,
                                     updated_at = now();
