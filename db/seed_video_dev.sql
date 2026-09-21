-- ============================================================
-- FZL Gaming — 视频功能的本地调试假数据
-- ============================================================
-- 配套 db/seed_dev.sql（那份喂的是战绩/基金/赛程），这份喂 /videos。
--
-- 前置：先跑 db/schema_video.sql。
-- 运行：psql "$POSTGRES_URL" -f db/seed_video_dev.sql
-- 清除：DELETE FROM videos WHERE object_key LIKE 'videos/2026/09/dddddddd%';
--
-- 【注意】object_key 指向的文件在 COS 上并不存在，这份数据只用来看
-- 卡片排版、评分聚合和评论的呈现。本地不配 COS 变量时，播放器位置会
-- 显示「视频存储还没配好」——这是预期的。想看真实播放效果，用
-- /videos/quality 对比台（纯浏览器端，不需要任何配置）。
--
-- 【警告】只对本地 / 自己的测试库执行，不要连生产库。
-- ============================================================

BEGIN;

-- 可重复执行：假 key 统一用 dddddddd 开头，好认也好删
-- （video_ratings / video_comments 都是 ON DELETE CASCADE）
DELETE FROM videos WHERE object_key LIKE 'videos/2026/09/dddddddd%';

-- 1. 字段填满的典型条目：有封面、有说明、8 人全打过分、5 条评论
INSERT INTO videos (object_key, poster_key, title, member, champion, description, duration_sec, size_bytes, width, height, created_at)
VALUES ('videos/2026/09/dddddddd000000000000000000000001.mp4', 'videos/2026/09/dddddddd000000000000000000000001.jpg',
        '亚索一打五，残血反杀', '讨好冷漠', '亚索', '大龙前那波，血量只剩一格，风墙挡住了对面全部技能',
        14.6, 5340000, 1920, 1080, now() - interval '2 hours');

-- 2. 没有封面、没有说明：测卡片在缺字段时的降级排版
INSERT INTO videos (object_key, poster_key, title, member, champion, description, duration_sec, size_bytes, width, height, created_at)
VALUES ('videos/2026/09/dddddddd000000000000000000000002.mp4', NULL,
        '打野越塔强杀', '变成光守护嘉然然', '蜘蛛女皇', NULL,
        11.2, 4120000, 1920, 1080, now() - interval '1 day');

-- 3. 还没人打分：测「—」和「还没人打分」两处空态
INSERT INTO videos (object_key, poster_key, title, member, champion, description, duration_sec, size_bytes, width, height, created_at)
VALUES ('videos/2026/09/dddddddd000000000000000000000003.mp4', 'videos/2026/09/dddddddd000000000000000000000003.jpg',
        '这波我觉得没问题', '他一定比我更温柔', '锤石', '虽然但是，钩子确实空了',
        9.8, 3180000, 1920, 1080, now() - interval '2 days');

-- 4. 超长标题 + 超长说明：测文字溢出会不会把卡片撑坏
INSERT INTO videos (object_key, poster_key, title, member, champion, description, duration_sec, size_bytes, width, height, created_at)
VALUES ('videos/2026/09/dddddddd000000000000000000000004.mp4', 'videos/2026/09/dddddddd000000000000000000000004.jpg',
        '这是一个非常非常长的标题用来测试卡片标题会不会换行或者溢出到外面去总共六十个字刚好卡满上限',
        '喑糖浆', '影流之主',
        '说明字段也拉满：这波团战我先绕后开雾进场，等对面交完控制再进，中间还卡了一个大招的CD，然后收掉三个人，最后残血跑掉，全程大概十几秒但信息量很大，用来测试说明文字多行时的排版效果',
        17.3, 5890000, 1920, 1080, now() - interval '3 days');

-- 5. 720p 的老素材：测不同分辨率的播放器容器
INSERT INTO videos (object_key, poster_key, title, member, champion, description, duration_sec, size_bytes, width, height, created_at)
VALUES ('videos/2026/09/dddddddd000000000000000000000005.mp4', 'videos/2026/09/dddddddd000000000000000000000005.jpg',
        '手机录的，画质一般', 'e说句爱我好吗', '寒冰射手', NULL,
        12.0, 1840000, 1280, 720, now() - interval '5 days');

-- ---------- 评分 ----------
-- 条目 1：8 人全打，平均 8.6（测满票 + 高分）
INSERT INTO video_ratings (video_id, member, score)
SELECT id, m.member, m.score FROM videos, (VALUES
  ('只怪我更爱自己', 9), ('讨好冷漠', 8), ('很遗憾不是吗', 9), ('他一定比我更温柔', 8),
  ('变成光守护嘉然然', 10), ('喑糖浆', 9), ('爱人要错过', 8), ('e说句爱我好吗', 8)
) AS m(member, score)
WHERE object_key = 'videos/2026/09/dddddddd000000000000000000000001.mp4';

-- 条目 2：3 人打分，平均 7.0
INSERT INTO video_ratings (video_id, member, score)
SELECT id, m.member, m.score FROM videos, (VALUES
  ('喑糖浆', 7), ('讨好冷漠', 6), ('爱人要错过', 8)
) AS m(member, score)
WHERE object_key = 'videos/2026/09/dddddddd000000000000000000000002.mp4';

-- 条目 4：2 人打分，含一个 1 分（测平均分小数位和低分显示）
INSERT INTO video_ratings (video_id, member, score)
SELECT id, m.member, m.score FROM videos, (VALUES
  ('很遗憾不是吗', 10), ('他一定比我更温柔', 1)
) AS m(member, score)
WHERE object_key = 'videos/2026/09/dddddddd000000000000000000000004.mp4';

-- 条目 5：1 人打分
INSERT INTO video_ratings (video_id, member, score)
SELECT id, '只怪我更爱自己', 6 FROM videos
WHERE object_key = 'videos/2026/09/dddddddd000000000000000000000005.mp4';

-- ---------- 评论 ----------
INSERT INTO video_comments (video_id, member, body, created_at)
SELECT id, c.member, c.body, now() - c.ago::interval FROM videos, (VALUES
  ('喑糖浆', '这风墙交得是真准', '100 minutes'),
  ('爱人要错过', '对面辅助当时在干嘛', '95 minutes'),
  ('变成光守护嘉然然', '我在旁边看着，确实秀', '80 minutes'),
  ('很遗憾不是吗', '再放一遍慢动作', '40 minutes'),
  ('他一定比我更温柔', '下次别这么浪', '12 minutes')
) AS c(member, body, ago)
WHERE object_key = 'videos/2026/09/dddddddd000000000000000000000001.mp4';

INSERT INTO video_comments (video_id, member, body, created_at)
SELECT id, c.member, c.body, now() - c.ago::interval FROM videos, (VALUES
  ('讨好冷漠', '塔伤都快扛不住了还敢上', '20 hours')
) AS c(member, body, ago)
WHERE object_key = 'videos/2026/09/dddddddd000000000000000000000002.mp4';

-- 一条很长的评论，测长文本换行
INSERT INTO video_comments (video_id, member, body, created_at)
SELECT id, '只怪我更爱自己',
  '认真说一句，这波其实有点险，如果对面打野没交闪现的话你大概率是走不掉的，不过结果导向来看确实是赚了，下次可以先等一个视野再进场',
  now() - interval '2 days'
FROM videos WHERE object_key = 'videos/2026/09/dddddddd000000000000000000000004.mp4';

COMMIT;
