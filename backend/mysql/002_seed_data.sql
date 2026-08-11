USE `zoo_harmony`;

INSERT INTO `card_config_version` (
  `config_type`,
  `config_version`,
  `config_hash`,
  `download_url`,
  `is_active`
) VALUES (
  'animal_card',
  'v1',
  'docs-animal-card-config-v1',
  '/configs/animals/card-config-v1.json',
  1
)
ON DUPLICATE KEY UPDATE
  `config_hash` = VALUES(`config_hash`),
  `download_url` = VALUES(`download_url`),
  `is_active` = VALUES(`is_active`),
  `updated_at` = CURRENT_TIMESTAMP(3);

INSERT INTO `season_info` (
  `season_id`,
  `season_name`,
  `start_time`,
  `end_time`,
  `season_status`,
  `settle_version`
) VALUES (
  1,
  'S1 试运营赛季',
  '2026-07-01 00:00:00.000',
  '2026-09-30 23:59:59.000',
  1,
  'v1'
)
ON DUPLICATE KEY UPDATE
  `season_name` = VALUES(`season_name`),
  `start_time` = VALUES(`start_time`),
  `end_time` = VALUES(`end_time`),
  `season_status` = VALUES(`season_status`),
  `settle_version` = VALUES(`settle_version`),
  `updated_at` = CURRENT_TIMESTAMP(3);

INSERT INTO `system_announcement` (
  `announcement_id`,
  `title`,
  `summary`,
  `content`,
  `announcement_status`,
  `priority`,
  `start_time`,
  `end_time`
) VALUES (
  1,
  '欢迎来到动物园和声',
  'MVP 后端数据库初始化完成，可开始联调基础流程。',
  '当前版本已准备好账号、构筑、匹配、对局和结算相关数据库结构，后续可继续接入服务端接口。',
  1,
  100,
  '2026-07-25 00:00:00.000',
  '2026-12-31 23:59:59.000'
)
ON DUPLICATE KEY UPDATE
  `title` = VALUES(`title`),
  `summary` = VALUES(`summary`),
  `content` = VALUES(`content`),
  `announcement_status` = VALUES(`announcement_status`),
  `priority` = VALUES(`priority`),
  `start_time` = VALUES(`start_time`),
  `end_time` = VALUES(`end_time`),
  `updated_at` = CURRENT_TIMESTAMP(3);

INSERT INTO `gacha_pool` (
  `pool_id`,
  `pool_name`,
  `gacha_type`,
  `consume_type`,
  `consume_amount`,
  `single_draw_count`,
  `output_scope_json`,
  `is_open`,
  `start_time`,
  `end_time`
) VALUES (
  'normal_pool_001',
  '常驻保育补给',
  'normal',
  'gold_coin',
  100,
  1,
  JSON_OBJECT(
    'source', 'docs/动物园和声_卡牌配置表_json草案_v1.json',
    'rarity_scope', JSON_ARRAY('white', 'blue', 'gold', 'red'),
    'duplicate_convert', JSON_OBJECT('reward_type', 'card_shard', 'base_amount', 10)
  ),
  1,
  '2026-07-01 00:00:00.000',
  '2026-12-31 23:59:59.000'
)
ON DUPLICATE KEY UPDATE
  `pool_name` = VALUES(`pool_name`),
  `gacha_type` = VALUES(`gacha_type`),
  `consume_type` = VALUES(`consume_type`),
  `consume_amount` = VALUES(`consume_amount`),
  `single_draw_count` = VALUES(`single_draw_count`),
  `output_scope_json` = VALUES(`output_scope_json`),
  `is_open` = VALUES(`is_open`),
  `start_time` = VALUES(`start_time`),
  `end_time` = VALUES(`end_time`),
  `updated_at` = CURRENT_TIMESTAMP(3);

INSERT INTO `app_config` (
  `config_key`,
  `config_value`,
  `config_desc`
) VALUES
(
  'bootstrap',
  JSON_OBJECT(
    'maintenance_mode', FALSE,
    'minimum_client_version', '1.0.0',
    'current_season_id', 1,
    'card_config_version', 'v1',
    'default_match_turn_seconds', 90,
    'disconnect_grace_seconds', 60
  ),
  '客户端 bootstrap 基础配置'
),
(
  'rank_tier_map',
  JSON_ARRAY(
    JSON_OBJECT('tier', 1, 'name', '实习饲养员'),
    JSON_OBJECT('tier', 2, 'name', '正式饲养员'),
    JSON_OBJECT('tier', 3, 'name', '展馆管理员'),
    JSON_OBJECT('tier', 4, 'name', '园区主管'),
    JSON_OBJECT('tier', 5, 'name', '副园长'),
    JSON_OBJECT('tier', 6, 'name', '园长'),
    JSON_OBJECT('tier', 7, 'name', '五星园长'),
    JSON_OBJECT('tier', 8, 'name', '世界保育馆长')
  ),
  '段位枚举配置'
),
(
  'reward_rule',
  JSON_OBJECT(
    'gold_formula', '40 + final_score * 2 + result_bonus',
    'result_bonus', JSON_OBJECT('win', 30, 'draw', 15, 'lose', 0),
    'abnormal_reward', JSON_OBJECT('surrender', 20, 'timeout', 10, 'disconnect', 10)
  ),
  '金币奖励规则'
)
ON DUPLICATE KEY UPDATE
  `config_value` = VALUES(`config_value`),
  `config_desc` = VALUES(`config_desc`),
  `updated_at` = CURRENT_TIMESTAMP(3);
