-- ============================================================
-- FZL Gaming — 本地调试假数据
-- ============================================================
-- 用途：本地没有生产库时，把 /matches、/matches/[id]、/fund、
-- /schedule 四个页面喂满，并覆盖代码里几个容易出问题的分支。
--
-- 全部是编造的数据。game_id 统一 66 开头（真实 SGP gameId 是 10 位
-- 纯数字，不会撞号），想清干净直接：
--     DELETE FROM matches WHERE game_id LIKE '66%';
--
-- 前置：先跑 db/schema.sql，再跑其余 6 个 schema_*.sql。
-- 运行：psql "$POSTGRES_URL" -f db/seed_dev.sql
--
-- 【警告】只对本地 / 自己的测试库执行，不要连生产库。
-- ============================================================

BEGIN;

-- 可重复执行：先删掉上一轮的假数据（match_players 是 ON DELETE CASCADE）
DELETE FROM matches WHERE game_id LIKE '66%';

-- 对局 1：单双排，车队 5 人在蓝方，赢
--   覆盖：满字段新对局 / MVP+SVP / 四杀 / 一血 / 0 死亡（kda 为 NULL）
INSERT INTO matches (game_id, game_creation_ms, duration_min, queue_id, queue_name, game_mode, roster_count, team_stats)
VALUES ('6600000001', 1789733700000, 32.5, 420, '单双排', 'CLASSIC', 5, '{"100":{"bans":[266,64,157,99,22],"dragon":4,"baron":1,"tower":9,"inhibitor":1,"riftHerald":1,"atakhan":1,"horde":3,"firstBlood":true,"firstTower":true,"firstDragon":true,"firstBaron":true,"firstInhibitor":true,"firstRiftHerald":true,"firstAtakhan":true,"firstHorde":true},"200":{"bans":[238,60,516,412,498],"dragon":1,"baron":0,"tower":2,"inhibitor":0,"riftHerald":0,"atakhan":0,"horde":1,"firstBlood":false,"firstTower":false,"firstDragon":false,"firstBaron":false,"firstInhibitor":false,"firstRiftHerald":false,"firstAtakhan":false,"firstHorde":false}}');

INSERT INTO match_players (game_id, puuid, member, player_name, team_id, position, champion, champion_id, spell1_id, spell2_id, win, score, award, kills, deaths, assists, kda, multi_kill, first_blood, gold, damage_to_champions, physical_damage, magic_damage, true_damage, damage_taken, heal, turret_damage, cc_time, cs, vision_score, wards_placed, wards_killed, champ_level, items, damage_self_mitigated, killing_sprees, largest_killing_spree, objectives_stolen, heals_on_teammates, gold_spent, time_spent_dead) VALUES
  ('6600000001', '9d9ee893-486a-5833-83b3-018b6b95208a', '只怪我更爱自己', '只怪我更爱自己#74030', 100, 'TOP', '山隐之焰', 516, 12, 4, TRUE, 7.82, '', 6, 3, 14, 6.67, '', FALSE, 14230, 18450, 3120, 14980, 350, 38900, 4200, 2840, 112, 218, 41, 6, 2, 18, '3068,3047,3075,3083,1028,0,3364', 41200, 1, 2, 0, 0, 13800, 78),
  ('6600000001', 'fd9adcf7-2535-531c-a85b-8c45256d9ece', '变成光守护嘉然然', '变成光守护嘉然然#74339', 100, 'JUNGLE', '蜘蛛女皇', 60, 11, 4, TRUE, 8.14, '', 9, 4, 11, 5.0, '双杀', FALSE, 13980, 24310, 6820, 17100, 390, 26400, 1890, 1620, 34, 168, 12, 9, 7, 17, '3153,3111,3134,3814,1037,0,3364', 22100, 2, 3, 1, 0, 13200, 96),
  ('6600000001', 'a8c06ad0-2d16-520c-acdc-afe9c79628e7', '喑糖浆', '喑糖浆#93803', 100, 'MIDDLE', '影流之主', 238, 4, 14, TRUE, 9.46, 'MVP', 14, 0, 7, NULL, '四杀', TRUE, 16840, 38920, 31200, 4100, 3620, 19800, 3100, 940, 28, 231, 9, 4, 1, 18, '3142,3006,6693,6676,3036,1038,3363', 16800, 4, 6, 0, 0, 16200, 0),
  ('6600000001', '34e527a2-f53b-50be-895e-ff0947f2d734', '爱人要错过', '爱人要错过#50456', 100, 'BOTTOM', '逆羽', 498, 4, 7, TRUE, 8.31, '', 11, 2, 9, 10.0, '三杀', FALSE, 16120, 33480, 29400, 1980, 2100, 14200, 6840, 410, 31, 247, 11, 3, 2, 18, '3031,3006,3094,3072,1038,1018,3363', 12400, 3, 5, 0, 0, 15600, 22),
  ('6600000001', 'bbc426f4-de13-54ce-a89b-f82e865da153', '他一定比我更温柔', '他一定比我更温柔#44278', 100, 'UTILITY', '河流之王', 223, 4, 3, TRUE, 6.95, '', 1, 6, 21, 3.67, '', FALSE, 9340, 8120, 2410, 5300, 410, 41200, 780, 0, 142, 34, 68, 38, 11, 15, '3190,3047,3050,3109,2055,0,3364', 38400, 0, 0, 0, 8900, 8800, 142),
  ('6600000001', 'fake-g1-opp-1', '', '风吹稻花香#12345', 200, 'TOP', '无双剑姬', 114, 12, 4, FALSE, 6.42, 'SVP', 8, 6, 3, 1.83, '', FALSE, 12100, 21400, 18900, 1200, 1300, 31200, 2400, 1980, 22, 198, 8, 3, 1, 16, '6672,3006,3153,3026,1055,0,3363', 34100, 1, 2, 0, 0, 11900, 168),
  ('6600000001', 'fake-g1-opp-2', '', '夜色温柔#66021', 200, 'JUNGLE', '盲僧', 64, 11, 4, FALSE, 4.88, '', 3, 8, 6, 1.13, '', FALSE, 9820, 14200, 11800, 900, 1500, 24100, 1100, 2240, 26, 121, 10, 4, 3, 14, '6631,3111,3071,1031,1028,0,3364', 28900, 0, 0, 0, 0, 9400, 214),
  ('6600000001', 'fake-g1-opp-3', '', '一杯敬明天#88190', 200, 'MIDDLE', '发条魔灵', 61, 4, 14, FALSE, 5.31, '', 5, 7, 8, 1.86, '', FALSE, 11400, 22800, 2100, 20100, 600, 18400, 2900, 3840, 24, 186, 9, 2, 1, 15, '6655,3020,3116,3165,1052,0,3363', 15200, 0, 1, 0, 0, 10800, 196),
  ('6600000001', 'fake-g1-opp-4', '', '只会玩射手#40012', 200, 'BOTTOM', '寒冰射手', 22, 4, 7, FALSE, 5.02, '', 4, 9, 5, 1.0, '', FALSE, 10900, 19600, 17400, 800, 1400, 16200, 3200, 5120, 19, 203, 7, 1, 0, 15, '3031,3006,3085,1038,1018,0,3363', 11800, 0, 1, 0, 0, 10200, 238),
  ('6600000001', 'fake-g1-opp-5', '', '辅助不摸鱼#77410', 200, 'UTILITY', '琴瑟仙女', 37, 4, 3, FALSE, 4.16, '', 0, 11, 9, 0.82, '', FALSE, 7200, 6400, 800, 5200, 400, 12100, 0, 2980, 58, 28, 31, 9, 0, 12, '3222,3158,3011,2065,0,0,3364', 19800, 0, 0, 0, 0, 6900, 276);

-- 对局 2：灵活组排，车队 5 人在红方，输
--   覆盖：车队在 200 方（团队对比左右side 反转）/ 长局 41.2 分钟 / SVP 在输的一方
INSERT INTO matches (game_id, game_creation_ms, duration_min, queue_id, queue_name, game_mode, roster_count, team_stats)
VALUES ('6600000002', 1789825200000, 41.2, 440, '灵活组排', 'CLASSIC', 5, '{"100":{"bans":[238,875,61,412,22],"dragon":3,"baron":2,"tower":11,"inhibitor":2,"riftHerald":1,"atakhan":1,"horde":4,"firstBlood":false,"firstTower":true,"firstDragon":true,"firstBaron":true,"firstInhibitor":true,"firstRiftHerald":false,"firstAtakhan":true,"firstHorde":true},"200":{"bans":[266,157,141,254,555],"dragon":2,"baron":0,"tower":4,"inhibitor":0,"riftHerald":1,"atakhan":0,"horde":2,"firstBlood":true,"firstTower":false,"firstDragon":false,"firstBaron":false,"firstInhibitor":false,"firstRiftHerald":false,"firstAtakhan":false,"firstHorde":false}}');

INSERT INTO match_players (game_id, puuid, member, player_name, team_id, position, champion, champion_id, spell1_id, spell2_id, win, score, award, kills, deaths, assists, kda, multi_kill, first_blood, gold, damage_to_champions, physical_damage, magic_damage, true_damage, damage_taken, heal, turret_damage, cc_time, cs, vision_score, wards_placed, wards_killed, champ_level, items, damage_self_mitigated, killing_sprees, largest_killing_spree, objectives_stolen, heals_on_teammates, gold_spent, time_spent_dead) VALUES
  ('6600000002', 'fake-g2-opp-1', '', '上单不玩坦克#31002', 100, 'TOP', '暗裔剑魔', 266, 12, 4, TRUE, 8.91, 'MVP', 11, 3, 8, 6.33, '三杀', FALSE, 17200, 31400, 27100, 1800, 2500, 42100, 8900, 3210, 68, 264, 28, 8, 4, 18, '6673,3047,3053,3071,1053,0,3364', 46200, 3, 5, 0, 0, 16800, 64),
  ('6600000002', 'fake-g2-opp-2', '', '野区一条狗#55831', 100, 'JUNGLE', '腕豪', 875, 11, 4, TRUE, 7.44, '', 7, 5, 14, 4.2, '', FALSE, 14100, 19800, 17200, 900, 1700, 38400, 3100, 2140, 94, 186, 34, 12, 6, 17, '6631,3111,3053,3748,1028,0,3364', 39800, 2, 3, 0, 0, 13900, 108),
  ('6600000002', 'fake-g2-opp-3', '', '中单混子#90124', 100, 'MIDDLE', '影流之镰', 141, 4, 14, TRUE, 7.08, '', 9, 6, 7, 2.67, '双杀', FALSE, 15400, 28600, 24800, 2100, 1700, 21400, 2200, 1180, 31, 228, 21, 7, 3, 17, '6692,3006,6694,3814,1037,0,3363', 18400, 2, 4, 0, 0, 15100, 124),
  ('6600000002', 'fake-g2-opp-4', '', '德莱文本人#66677', 100, 'BOTTOM', '皮城执法官', 254, 4, 7, TRUE, 6.77, '', 8, 7, 9, 2.43, '', FALSE, 16800, 26200, 23100, 1400, 1700, 19800, 4100, 890, 42, 271, 24, 9, 2, 18, '3031,3006,6675,3046,1038,1018,3363', 16100, 1, 3, 0, 0, 16400, 148),
  ('6600000002', 'fake-g2-opp-5', '', '奶妈很忙#20418', 100, 'UTILITY', '血港鬼影', 555, 4, 3, TRUE, 6.19, '', 3, 9, 18, 2.33, '', FALSE, 10200, 11400, 9100, 1800, 500, 26800, 1400, 1020, 88, 41, 62, 34, 14, 15, '3179,3158,3071,3123,2055,0,3364', 24100, 0, 1, 0, 0, 9800, 192),
  ('6600000002', '2270b22b-bad1-50ce-a939-ba56719014b1', '讨好冷漠', '讨好冷漠#43386', 200, 'TOP', '疾风剑豪', 157, 12, 4, FALSE, 6.88, 'SVP', 7, 8, 4, 1.38, '双杀', TRUE, 13800, 24100, 21400, 1200, 1500, 34200, 2800, 1940, 44, 241, 19, 6, 2, 17, '6673,3006,3031,3072,1018,0,3363', 31200, 1, 3, 0, 0, 13400, 186),
  ('6600000002', 'fdac3cee-7b6b-5315-b796-9196cf0e8932', 'e说句爱我好吗', 'e说句爱我好吗#11807', 200, 'JUNGLE', '虚空先知', 90, 11, 4, FALSE, 5.42, '', 4, 9, 9, 1.44, '', FALSE, 11200, 18400, 2100, 15800, 500, 29800, 1600, 2840, 76, 142, 26, 10, 4, 15, '3152,3020,3157,3165,1058,0,3364', 26400, 0, 1, 0, 0, 10900, 218),
  ('6600000002', '7784ed69-78f0-550f-b16c-058fd99f386a', '很遗憾不是吗', '很遗憾不是吗#86678', 200, 'MIDDLE', '离群之刺', 84, 4, 14, FALSE, 6.31, '', 6, 10, 6, 1.2, '', FALSE, 12400, 21800, 19200, 1100, 1500, 22100, 2400, 1120, 38, 198, 22, 7, 3, 16, '3142,3006,6694,6676,1037,0,3363', 17800, 1, 2, 0, 0, 12100, 242),
  ('6600000002', '9d9ee893-486a-5833-83b3-018b6b95208a', '只怪我更爱自己', '只怪我更爱自己#74030', 200, 'BOTTOM', '唤潮鲛姬', 267, 4, 7, FALSE, 5.96, '', 3, 7, 12, 2.14, '', FALSE, 13100, 17200, 14800, 1200, 1200, 16400, 5200, 680, 52, 218, 24, 8, 2, 16, '3504,3006,3085,3115,1018,0,3363', 13200, 0, 1, 0, 0, 12600, 174),
  ('6600000002', 'bbc426f4-de13-54ce-a89b-f82e865da153', '他一定比我更温柔', '他一定比我更温柔#44278', 200, 'UTILITY', '深海泰坦', 111, 4, 3, FALSE, 5.14, '', 1, 11, 14, 1.36, '', FALSE, 8400, 7800, 5900, 1400, 500, 31400, 900, 1840, 118, 28, 54, 29, 11, 14, '3190,3047,3109,3050,2055,0,3364', 33800, 0, 0, 0, 0, 8100, 264);

-- 对局 3：大乱斗，老数据
--   覆盖：team_stats 为 NULL（对局概览降级）/ 新增列全 NULL（toPlayer 的 ?? 0 兜底）
--        / position 为空串 / roster_count=4（刚好过 MIN_TEAM_MEMBERS=3）
INSERT INTO matches (game_id, game_creation_ms, duration_min, queue_id, queue_name, game_mode, roster_count, team_stats)
VALUES ('6600000003', 1789653900000, 18.7, 450, '大乱斗', 'ARAM', 4, NULL);

INSERT INTO match_players (game_id, puuid, member, player_name, team_id, position, champion, champion_id, spell1_id, spell2_id, win, score, award, kills, deaths, assists, kda, multi_kill, first_blood, gold, damage_to_champions, physical_damage, magic_damage, true_damage, damage_taken, heal, turret_damage, cc_time, cs, vision_score, wards_placed, wards_killed, champ_level, items, damage_self_mitigated, killing_sprees, largest_killing_spree, objectives_stolen, heals_on_teammates, gold_spent, time_spent_dead) VALUES
  ('6600000003', 'a8c06ad0-2d16-520c-acdc-afe9c79628e7', '喑糖浆', '喑糖浆#93803', 100, '', '封魔剑魂', NULL, NULL, NULL, TRUE, 8.02, 'MVP', 18, 9, 22, 4.44, NULL, NULL, 21400, 41200, NULL, NULL, NULL, 34100, 4200, NULL, NULL, 62, 12, NULL, NULL, 18, '3142,3006,6693,6676,3036,1038,3363', NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  ('6600000003', '34e527a2-f53b-50be-895e-ff0947f2d734', '爱人要错过', '爱人要错过#50456', 100, '', '戏命师', NULL, NULL, NULL, TRUE, 7.21, '', 12, 11, 26, 3.45, NULL, NULL, 19800, 36400, NULL, NULL, NULL, 12100, 4200, NULL, NULL, 48, 8, NULL, NULL, 18, '3031,3006,3094,3072,1038,1018,3363', NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  ('6600000003', 'fd9adcf7-2535-531c-a85b-8c45256d9ece', '变成光守护嘉然然', '变成光守护嘉然然#74339', 100, '', '曙光女神', NULL, NULL, NULL, TRUE, 6.44, '', 6, 14, 31, 2.64, NULL, NULL, 16200, 21800, NULL, NULL, NULL, 38900, 4200, NULL, NULL, 22, 4, NULL, NULL, 17, '3190,3047,3109,3050,2055,0,3364', NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  ('6600000003', '7784ed69-78f0-550f-b16c-058fd99f386a', '很遗憾不是吗', '很遗憾不是吗#86678', 100, '', '复仇焰魂', NULL, NULL, NULL, TRUE, 6.88, '', 14, 12, 19, 2.75, NULL, NULL, 18400, 33100, NULL, NULL, NULL, 24100, 4200, NULL, NULL, 31, 6, NULL, NULL, 18, '6655,3020,3116,3165,1052,0,3363', NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  ('6600000003', 'fake-g3-ally-5', '', '路过的陌生人#10293', 100, '', '魔法猫咪', NULL, NULL, NULL, TRUE, 5.12, '', 5, 16, 24, 1.81, NULL, NULL, 13200, 18900, NULL, NULL, NULL, 31200, 2100, NULL, NULL, 18, 2, NULL, NULL, 16, '3157,3020,3116,0,0,0,3364', NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  ('6600000003', 'fake-g3-opp-1', '', '对面大乱斗#11111', 200, '', '祖安花火', NULL, NULL, NULL, FALSE, 6.91, 'SVP', 16, 13, 18, 2.62, NULL, NULL, 20100, 38400, NULL, NULL, NULL, 28400, 3100, NULL, NULL, 41, 5, NULL, NULL, 18, '0,0,0,0,0,0,3363', NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  ('6600000003', 'fake-g3-opp-2', '', '随机到辅助#22222', 200, '', '殇之木乃伊', NULL, NULL, NULL, FALSE, 5.33, '', 4, 15, 28, 2.13, NULL, NULL, 14800, 16200, NULL, NULL, NULL, 34100, 3100, NULL, NULL, 12, 2, NULL, NULL, 16, '0,0,0,0,0,0,3363', NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  ('6600000003', 'fake-g3-opp-3', '', '手长真好#33333', 200, '', '寒冰射手', NULL, NULL, NULL, FALSE, 6.02, '', 11, 14, 21, 2.29, NULL, NULL, 17900, 29800, NULL, NULL, NULL, 19400, 3100, NULL, NULL, 38, 4, NULL, NULL, 17, '0,0,0,0,0,0,3363', NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  ('6600000003', 'fake-g3-opp-4', '', '法穿棒战士#44444', 200, '', '黑暗之女', NULL, NULL, NULL, FALSE, 5.78, '', 9, 16, 23, 2.0, NULL, NULL, 16400, 27100, NULL, NULL, NULL, 22800, 3100, NULL, NULL, 29, 3, NULL, NULL, 17, '0,0,0,0,0,0,3363', NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  ('6600000003', 'fake-g3-opp-5', '', '坦克挡前面#55555', 200, '', '牛头酋长', NULL, NULL, NULL, FALSE, 4.96, '', 2, 18, 30, 1.78, NULL, NULL, 12100, 9800, NULL, NULL, NULL, 41200, 3100, NULL, NULL, 8, 1, NULL, NULL, 15, '0,0,0,0,0,0,3363', NULL, NULL, NULL, NULL, NULL, NULL, NULL);

-- ---------- 峡谷基金流水 ----------
-- balance 是读取时用 SUM() OVER (ORDER BY entry_date, id) 算出来的，
-- 不用自己填。这里覆盖：纯收入行、纯支出行、同一天多条（测试 id 次序）。
DELETE FROM ledger_entries WHERE item LIKE '[假数据]%';
INSERT INTO ledger_entries (entry_date, type, item, income, expense, handler) VALUES
  ('2026-09-02', '支出', '[假数据] 战队头像设计', NULL, 150.00, '喑糖浆'),
  ('2026-09-05', '收入', '[假数据] 赞助：楼下奶茶店', 500.00, NULL, '郑儿朗'),
  ('2026-09-05', '支出', '[假数据] 训练赛场地费', NULL, 80.00, '郑儿朗'),
  ('2026-09-11', '支出', '[假数据] 队服定制 8 件', NULL, 640.00, '喑糖浆'),
  ('2026-09-16', '收入', '[假数据] 内战奖金池退回', 120.50, NULL, '爱人要错过'),
  ('2026-09-19', '支出', '[假数据] 服务器与域名', NULL, 99.00, '喑糖浆');

-- ---------- 资金页密码 ----------
-- 明文就是 123456（scrypt 加盐哈希，算法见 src/lib/ledgerAuth.ts）。
-- 设了它就能直接测"填写流水"表单，不用再走一次性的 setup 流程。
INSERT INTO app_settings (key, value) VALUES ('ledger_password_hash', 'dfa57a363d6992ffcf2090cb79fc74ea:b11c147dbb57298f3c5b8b7cf6237e74c72be35ae481ef4b6e078f5baa266d52259f323cd00b1f343defc87ceb62d93af4ec1507583205b4fe38b19bdefbf089')
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- ---------- 赛程报名 ----------
DELETE FROM signups WHERE signup_date IN ('2026-09-20', '2026-09-21');
INSERT INTO signups (signup_date, member, position, champion_pick_1, champion_pick_2, champion_pick_3, declaration, start_minute, end_minute) VALUES
  ('2026-09-20', '喑糖浆', 'MIDDLE', '劫', '亚索', '塔姆', '今晚必赢', 1200, 1380),
  ('2026-09-20', '爱人要错过', 'BOTTOM', '逆羽', '辛德拉', '魂锁典狱长', NULL, 1200, 1380),
  ('2026-09-20', '变成光守护嘉然然', 'JUNGLE', '伊莉丝', '阿木木', '布兰德', '打野已就位', 1230, 1380),
  ('2026-09-20', '只怪我更爱自己', 'TOP', '奥恩', '萨勒芬妮', '加里奥', NULL, NULL, NULL),
  ('2026-09-21', '很遗憾不是吗', 'MIDDLE', '泰隆', '乌拉迪米尔', '塞拉斯', '明天见', 1140, 1320);

COMMIT;

-- ============================================================
-- 可选：一条"残缺"对局（只有 9 名玩家），用来测 getIncompleteGameIds
-- 的自愈逻辑 —— 正常同步时它会被识别出来并自动重新拉取补全。
-- 需要时把下面整段的注释去掉再跑。
-- ============================================================
-- BEGIN;
-- INSERT INTO matches (game_id, game_creation_ms, duration_min, queue_id, queue_name, game_mode, roster_count, team_stats)
-- VALUES ('6600000004', 1789903800000, 27.3, 420, '单双排', 'CLASSIC', 5, NULL);
-- INSERT INTO match_players (game_id, puuid, member, player_name, team_id, position, champion, win, kills, deaths, assists, kda, gold, damage_to_champions, damage_taken, heal, cs, vision_score, champ_level, items)
-- VALUES ('6600000004', 'a8c06ad0-2d16-520c-acdc-afe9c79628e7', '喑糖浆', '喑糖浆#93803', 100, 'MIDDLE', '影流之主', TRUE, 9, 4, 6, 3.75, 13400, 24100, 18200, 2100, 198, 14, 16, '3142,3006,6693,0,0,0,3363');
-- COMMIT;
