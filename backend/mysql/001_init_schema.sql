CREATE DATABASE IF NOT EXISTS `zoo_harmony`
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_0900_ai_ci;

USE `zoo_harmony`;

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS `app_config` (
  `config_key` VARCHAR(64) NOT NULL COMMENT '配置键',
  `config_value` JSON NOT NULL COMMENT '配置值 JSON',
  `config_desc` VARCHAR(255) NOT NULL DEFAULT '' COMMENT '配置说明',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`config_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='应用基础配置';

CREATE TABLE IF NOT EXISTS `card_config_version` (
  `version_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `config_type` VARCHAR(32) NOT NULL DEFAULT 'animal_card' COMMENT '配置类型',
  `config_version` VARCHAR(32) NOT NULL COMMENT '配置版本号',
  `config_hash` VARCHAR(128) NOT NULL COMMENT '配置 hash',
  `download_url` VARCHAR(255) NOT NULL DEFAULT '' COMMENT '配置下载地址',
  `is_active` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否当前生效版本',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`version_id`),
  UNIQUE KEY `uq_card_config_type_version` (`config_type`, `config_version`),
  KEY `idx_card_config_active` (`config_type`, `is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='静态卡牌配置版本表';

CREATE TABLE IF NOT EXISTS `system_announcement` (
  `announcement_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `title` VARCHAR(128) NOT NULL COMMENT '公告标题',
  `summary` VARCHAR(255) NOT NULL DEFAULT '' COMMENT '公告摘要',
  `content` TEXT NOT NULL COMMENT '公告正文',
  `announcement_status` TINYINT NOT NULL DEFAULT 1 COMMENT '0 下线 1 生效',
  `priority` INT NOT NULL DEFAULT 0 COMMENT '优先级，越大越靠前',
  `start_time` DATETIME(3) NULL COMMENT '生效开始时间',
  `end_time` DATETIME(3) NULL COMMENT '生效结束时间',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`announcement_id`),
  KEY `idx_announcement_status_time` (`announcement_status`, `priority`, `start_time`, `end_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='公告表';

CREATE TABLE IF NOT EXISTS `player_account` (
  `player_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `primary_platform` VARCHAR(32) NOT NULL DEFAULT 'taptap_android' COMMENT '首登平台',
  `platform_user_id` VARCHAR(128) NOT NULL COMMENT '平台用户唯一标识',
  `platform_union_id` VARCHAR(128) NULL COMMENT '跨应用统一标识',
  `nickname` VARCHAR(64) NOT NULL DEFAULT '' COMMENT '账号昵称快照',
  `avatar_url` VARCHAR(255) NOT NULL DEFAULT '' COMMENT '头像地址',
  `register_time` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `last_login_time` DATETIME(3) NULL COMMENT '最近登录时间',
  `login_status` TINYINT NOT NULL DEFAULT 1 COMMENT '1 正常 0 封禁',
  `tutorial_step` INT NOT NULL DEFAULT 0 COMMENT '新手引导进度',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`player_id`),
  UNIQUE KEY `uq_player_platform_user` (`primary_platform`, `platform_user_id`),
  KEY `idx_player_last_login` (`last_login_time`),
  KEY `idx_player_platform_union` (`platform_union_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='玩家主账号表';

CREATE TABLE IF NOT EXISTS `player_profile` (
  `player_id` BIGINT UNSIGNED NOT NULL,
  `display_name` VARCHAR(64) NOT NULL COMMENT '展示昵称',
  `signature` VARCHAR(255) NOT NULL DEFAULT '' COMMENT '个性签名',
  `selected_deck_id` BIGINT UNSIGNED NULL COMMENT '当前出战牌库',
  `highest_rank_tier` INT NOT NULL DEFAULT 1 COMMENT '历史最高段位',
  `total_match_count` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '总对局数',
  `total_win_count` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '总胜场',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`player_id`),
  UNIQUE KEY `uq_profile_display_name` (`display_name`),
  KEY `idx_profile_selected_deck` (`selected_deck_id`),
  CONSTRAINT `fk_profile_player` FOREIGN KEY (`player_id`) REFERENCES `player_account` (`player_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='玩家扩展资料表';

CREATE TABLE IF NOT EXISTS `player_session` (
  `session_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `player_id` BIGINT UNSIGNED NOT NULL,
  `platform` VARCHAR(32) NOT NULL DEFAULT 'taptap_android' COMMENT '当前登录平台',
  `device_id` VARCHAR(128) NOT NULL DEFAULT '' COMMENT '设备 ID',
  `client_version` VARCHAR(32) NOT NULL DEFAULT '' COMMENT '客户端版本号',
  `access_token` VARCHAR(128) NOT NULL COMMENT '访问令牌',
  `refresh_token` VARCHAR(128) NOT NULL COMMENT '刷新令牌',
  `session_status` TINYINT NOT NULL DEFAULT 1 COMMENT '1 生效 0 登出 2 失效',
  `login_ip` VARCHAR(64) NOT NULL DEFAULT '' COMMENT '登录 IP',
  `last_seen_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '最后活跃时间',
  `expire_at` DATETIME(3) NOT NULL COMMENT 'access_token 过期时间',
  `refresh_expire_at` DATETIME(3) NOT NULL COMMENT 'refresh_token 过期时间',
  `logout_at` DATETIME(3) NULL COMMENT '登出时间',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`session_id`),
  UNIQUE KEY `uq_session_access_token` (`access_token`),
  UNIQUE KEY `uq_session_refresh_token` (`refresh_token`),
  KEY `idx_session_player_status` (`player_id`, `session_status`),
  KEY `idx_session_expire` (`expire_at`, `refresh_expire_at`),
  CONSTRAINT `fk_session_player` FOREIGN KEY (`player_id`) REFERENCES `player_account` (`player_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='玩家登录会话表';

CREATE TABLE IF NOT EXISTS `player_resource` (
  `player_id` BIGINT UNSIGNED NOT NULL,
  `gold_coin` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '金币',
  `gem` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '宝石',
  `card_shard` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '碎片或保育券',
  `rank_star_protect` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '段位保护次数',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`player_id`),
  CONSTRAINT `fk_resource_player` FOREIGN KEY (`player_id`) REFERENCES `player_account` (`player_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='玩家资源总表';

CREATE TABLE IF NOT EXISTS `reward_log` (
  `log_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `player_id` BIGINT UNSIGNED NOT NULL,
  `reward_type` VARCHAR(32) NOT NULL COMMENT '资源类型',
  `change_amount` INT NOT NULL COMMENT '增减值',
  `before_amount` INT NOT NULL COMMENT '变更前数值',
  `after_amount` INT NOT NULL COMMENT '变更后数值',
  `source_type` VARCHAR(32) NOT NULL COMMENT '来源类型',
  `source_id` VARCHAR(64) NOT NULL DEFAULT '' COMMENT '来源标识',
  `idempotency_key` VARCHAR(64) NULL COMMENT '幂等键',
  `remark` VARCHAR(255) NOT NULL DEFAULT '' COMMENT '备注',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`log_id`),
  UNIQUE KEY `uq_reward_idempotency` (`idempotency_key`),
  KEY `idx_reward_player_time` (`player_id`, `created_at`),
  KEY `idx_reward_source` (`source_type`, `source_id`),
  CONSTRAINT `fk_reward_player` FOREIGN KEY (`player_id`) REFERENCES `player_account` (`player_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='资源变更流水表';

CREATE TABLE IF NOT EXISTS `player_card_inventory` (
  `player_id` BIGINT UNSIGNED NOT NULL,
  `card_id` VARCHAR(16) NOT NULL COMMENT '静态卡牌 ID',
  `owned_count` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '持有数量',
  `obtained_first_time` DATETIME(3) NULL COMMENT '首次获得时间',
  `last_obtained_time` DATETIME(3) NULL COMMENT '最近获得时间',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`player_id`, `card_id`),
  KEY `idx_card_inventory_card` (`card_id`),
  CONSTRAINT `fk_inventory_player` FOREIGN KEY (`player_id`) REFERENCES `player_account` (`player_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='玩家持卡表';

CREATE TABLE IF NOT EXISTS `gacha_pool` (
  `pool_id` VARCHAR(32) NOT NULL COMMENT '卡池 ID',
  `pool_name` VARCHAR(64) NOT NULL COMMENT '卡池名称',
  `gacha_type` VARCHAR(32) NOT NULL DEFAULT 'normal' COMMENT '卡池类型',
  `consume_type` VARCHAR(32) NOT NULL DEFAULT 'gold_coin' COMMENT '消耗类型',
  `consume_amount` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '单次消耗数量',
  `single_draw_count` INT UNSIGNED NOT NULL DEFAULT 1 COMMENT '单次抽取张数',
  `output_scope_json` JSON NOT NULL COMMENT '产出范围',
  `is_open` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否开放',
  `start_time` DATETIME(3) NULL COMMENT '开放开始时间',
  `end_time` DATETIME(3) NULL COMMENT '开放结束时间',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`pool_id`),
  KEY `idx_gacha_pool_open` (`is_open`, `start_time`, `end_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='卡池配置表';

CREATE TABLE IF NOT EXISTS `gacha_log` (
  `log_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `player_id` BIGINT UNSIGNED NOT NULL,
  `pool_id` VARCHAR(32) NOT NULL,
  `gacha_type` VARCHAR(32) NOT NULL COMMENT '抽卡类型',
  `consume_type` VARCHAR(32) NOT NULL COMMENT '消耗类型',
  `consume_amount` INT UNSIGNED NOT NULL COMMENT '消耗数量',
  `draw_count` INT UNSIGNED NOT NULL DEFAULT 1 COMMENT '抽卡次数',
  `result_json` JSON NOT NULL COMMENT '抽卡结果',
  `converted_reward_json` JSON NULL COMMENT '重复卡转化结果',
  `random_seed` VARCHAR(64) NOT NULL COMMENT '抽卡随机种子',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`log_id`),
  KEY `idx_gacha_player_time` (`player_id`, `created_at`),
  KEY `idx_gacha_pool_time` (`pool_id`, `created_at`),
  CONSTRAINT `fk_gacha_player` FOREIGN KEY (`player_id`) REFERENCES `player_account` (`player_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_gacha_pool` FOREIGN KEY (`pool_id`) REFERENCES `gacha_pool` (`pool_id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='抽卡流水表';

CREATE TABLE IF NOT EXISTS `player_deck` (
  `deck_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `player_id` BIGINT UNSIGNED NOT NULL,
  `deck_name` VARCHAR(64) NOT NULL COMMENT '牌库名称',
  `is_active` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否当前出战牌库',
  `total_cost` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '总成本',
  `white_count` TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '白卡数量',
  `blue_count` TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '蓝卡数量',
  `gold_count` TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '金卡数量',
  `red_count` TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '红卡数量',
  `deck_status` TINYINT NOT NULL DEFAULT 0 COMMENT '1 合法 0 非法',
  `validation_errors_json` JSON NULL COMMENT '规则校验结果',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`deck_id`),
  KEY `idx_deck_player_active` (`player_id`, `is_active`),
  KEY `idx_deck_player_status` (`player_id`, `deck_status`),
  CONSTRAINT `fk_deck_player` FOREIGN KEY (`player_id`) REFERENCES `player_account` (`player_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='玩家牌库主表';

CREATE TABLE IF NOT EXISTS `player_deck_card` (
  `deck_id` BIGINT UNSIGNED NOT NULL,
  `player_id` BIGINT UNSIGNED NOT NULL,
  `card_id` VARCHAR(16) NOT NULL COMMENT '卡牌 ID',
  `slot_index` TINYINT UNSIGNED NOT NULL COMMENT '显示顺序',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`deck_id`, `card_id`),
  UNIQUE KEY `uq_deck_card_slot` (`deck_id`, `slot_index`),
  KEY `idx_deck_card_player` (`player_id`, `card_id`),
  CONSTRAINT `fk_deck_card_deck` FOREIGN KEY (`deck_id`) REFERENCES `player_deck` (`deck_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_deck_card_player` FOREIGN KEY (`player_id`) REFERENCES `player_account` (`player_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='牌库卡牌明细表';

CREATE TABLE IF NOT EXISTS `season_info` (
  `season_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `season_name` VARCHAR(64) NOT NULL COMMENT '赛季名',
  `start_time` DATETIME(3) NOT NULL COMMENT '开始时间',
  `end_time` DATETIME(3) NOT NULL COMMENT '结束时间',
  `season_status` TINYINT NOT NULL DEFAULT 0 COMMENT '0 未开始 1 进行中 2 已结束',
  `settle_version` VARCHAR(16) NOT NULL DEFAULT 'v1' COMMENT '结算规则版本',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`season_id`),
  KEY `idx_season_status_time` (`season_status`, `start_time`, `end_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='赛季信息表';

CREATE TABLE IF NOT EXISTS `player_rank` (
  `player_id` BIGINT UNSIGNED NOT NULL,
  `season_id` BIGINT UNSIGNED NOT NULL,
  `rank_tier` INT NOT NULL DEFAULT 1 COMMENT '段位层级',
  `star_count` INT NOT NULL DEFAULT 0 COMMENT '当前星数',
  `rank_score` INT NOT NULL DEFAULT 0 COMMENT '顶段位积分',
  `win_count` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '本赛季胜场',
  `lose_count` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '本赛季败场',
  `draw_count` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '本赛季平局',
  `highest_rank_tier` INT NOT NULL DEFAULT 1 COMMENT '赛季内最高段位',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`player_id`, `season_id`),
  KEY `idx_rank_season_leaderboard` (`season_id`, `rank_tier` DESC, `star_count` DESC, `rank_score` DESC, `updated_at` ASC),
  CONSTRAINT `fk_rank_player` FOREIGN KEY (`player_id`) REFERENCES `player_account` (`player_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_rank_season` FOREIGN KEY (`season_id`) REFERENCES `season_info` (`season_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='玩家赛季排位表';

CREATE TABLE IF NOT EXISTS `matchmaking_queue` (
  `queue_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `player_id` BIGINT UNSIGNED NOT NULL,
  `match_type` VARCHAR(32) NOT NULL COMMENT 'ranked/casual/friend',
  `season_id` BIGINT UNSIGNED NULL COMMENT '赛季 ID',
  `deck_id` BIGINT UNSIGNED NOT NULL COMMENT '用于匹配的牌库',
  `queue_status` TINYINT NOT NULL DEFAULT 0 COMMENT '0 排队中 1 已匹配 2 已取消 3 超时 4 已失效',
  `expand_level` TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '扩圈等级',
  `estimated_wait_seconds` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '预估等待秒数',
  `match_id` BIGINT UNSIGNED NULL COMMENT '匹配成功后的对局 ID',
  `platform` VARCHAR(32) NOT NULL DEFAULT 'taptap_android' COMMENT '平台',
  `client_version` VARCHAR(32) NOT NULL DEFAULT '' COMMENT '客户端版本',
  `enqueue_time` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `matched_time` DATETIME(3) NULL COMMENT '匹配成功时间',
  `cancel_time` DATETIME(3) NULL COMMENT '取消时间',
  PRIMARY KEY (`queue_id`),
  KEY `idx_queue_player_status` (`player_id`, `queue_status`),
  KEY `idx_queue_match_type_status` (`match_type`, `queue_status`, `enqueue_time`),
  KEY `idx_queue_match_id` (`match_id`),
  CONSTRAINT `fk_queue_player` FOREIGN KEY (`player_id`) REFERENCES `player_account` (`player_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_queue_deck` FOREIGN KEY (`deck_id`) REFERENCES `player_deck` (`deck_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_queue_season` FOREIGN KEY (`season_id`) REFERENCES `season_info` (`season_id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='匹配排队表';

CREATE TABLE IF NOT EXISTS `friend_room` (
  `friend_room_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `room_code` VARCHAR(16) NOT NULL COMMENT '好友房码',
  `owner_player_id` BIGINT UNSIGNED NOT NULL COMMENT '房主玩家 ID',
  `invited_player_id` BIGINT UNSIGNED NULL COMMENT '受邀玩家 ID',
  `match_id` BIGINT UNSIGNED NULL COMMENT '开局后关联的对局 ID',
  `room_status` TINYINT NOT NULL DEFAULT 0 COMMENT '0 待加入 1 已满 2 已开局 3 已解散 4 已过期',
  `is_rank_affected` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否影响排位',
  `reward_ratio` DECIMAL(5,2) NOT NULL DEFAULT 0.50 COMMENT '奖励系数',
  `expire_at` DATETIME(3) NULL COMMENT '过期时间',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`friend_room_id`),
  UNIQUE KEY `uq_friend_room_code` (`room_code`),
  KEY `idx_friend_room_owner_status` (`owner_player_id`, `room_status`),
  KEY `idx_friend_room_match_id` (`match_id`),
  CONSTRAINT `fk_friend_room_owner` FOREIGN KEY (`owner_player_id`) REFERENCES `player_account` (`player_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_friend_room_invited` FOREIGN KEY (`invited_player_id`) REFERENCES `player_account` (`player_id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='好友房主表';

CREATE TABLE IF NOT EXISTS `friend_room_player` (
  `friend_room_id` BIGINT UNSIGNED NOT NULL,
  `player_id` BIGINT UNSIGNED NOT NULL,
  `join_status` TINYINT NOT NULL DEFAULT 0 COMMENT '0 已邀请 1 已加入 2 已准备 3 已离开',
  `joined_at` DATETIME(3) NULL COMMENT '加入时间',
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`friend_room_id`, `player_id`),
  KEY `idx_friend_room_player_status` (`player_id`, `join_status`),
  CONSTRAINT `fk_friend_room_player_room` FOREIGN KEY (`friend_room_id`) REFERENCES `friend_room` (`friend_room_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_friend_room_player_player` FOREIGN KEY (`player_id`) REFERENCES `player_account` (`player_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='好友房参与玩家表';

CREATE TABLE IF NOT EXISTS `match_room` (
  `match_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `queue_id` BIGINT UNSIGNED NULL COMMENT '来源匹配队列',
  `friend_room_id` BIGINT UNSIGNED NULL COMMENT '来源好友房',
  `match_type` VARCHAR(32) NOT NULL COMMENT 'ranked/casual/friend',
  `season_id` BIGINT UNSIGNED NULL COMMENT '所属赛季',
  `room_status` TINYINT NOT NULL DEFAULT 0 COMMENT '0 创建 1 进行中 2 结算中 3 已完成 4 异常结束',
  `turn_no` INT UNSIGNED NOT NULL DEFAULT 1 COMMENT '当前回合数',
  `step_status` VARCHAR(32) NOT NULL DEFAULT 'pick_terrain_group' COMMENT '当前步骤',
  `state_version` INT UNSIGNED NOT NULL DEFAULT 1 COMMENT '状态版本号',
  `first_player_id` BIGINT UNSIGNED NULL COMMENT '先手玩家',
  `turn_player_id` BIGINT UNSIGNED NULL COMMENT '当前行动玩家',
  `winner_player_id` BIGINT UNSIGNED NULL COMMENT '胜者玩家',
  `random_seed` VARCHAR(64) NOT NULL COMMENT '对局随机种子',
  `terrain_bag_snapshot` JSON NOT NULL COMMENT '初始地形袋快照',
  `terrain_market_snapshot` JSON NULL COMMENT '当前地形市场快照',
  `terrain_bag_remaining` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '地形袋剩余数量',
  `turn_deadline_at` DATETIME(3) NULL COMMENT '当前回合截止时间',
  `last_action_at` DATETIME(3) NULL COMMENT '最近动作时间',
  `end_trigger_type` VARCHAR(32) NULL COMMENT '终局触发类型',
  `end_trigger_turn_no` INT UNSIGNED NULL COMMENT '终局触发回合',
  `final_round_player_id` BIGINT UNSIGNED NULL COMMENT '补齐最后回合的玩家',
  `end_reason` VARCHAR(32) NULL COMMENT '结束原因',
  `start_time` DATETIME(3) NULL COMMENT '开始时间',
  `end_time` DATETIME(3) NULL COMMENT '结束时间',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`match_id`),
  KEY `idx_match_status_type` (`room_status`, `match_type`, `created_at`),
  KEY `idx_match_season_time` (`season_id`, `start_time`),
  KEY `idx_match_turn_player` (`turn_player_id`, `room_status`),
  CONSTRAINT `fk_match_queue` FOREIGN KEY (`queue_id`) REFERENCES `matchmaking_queue` (`queue_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_match_friend_room` FOREIGN KEY (`friend_room_id`) REFERENCES `friend_room` (`friend_room_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_match_season` FOREIGN KEY (`season_id`) REFERENCES `season_info` (`season_id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='对局主表';

CREATE TABLE IF NOT EXISTS `match_player` (
  `match_id` BIGINT UNSIGNED NOT NULL,
  `player_id` BIGINT UNSIGNED NOT NULL,
  `seat_no` TINYINT UNSIGNED NOT NULL COMMENT '座位号 1/2',
  `deck_id` BIGINT UNSIGNED NOT NULL COMMENT '实际使用牌库',
  `deck_snapshot_json` JSON NOT NULL COMMENT '12 张带入牌库快照',
  `deck_draw_order_json` JSON NULL COMMENT '洗牌后顺序',
  `opening_option_json` JSON NOT NULL COMMENT '开局 4 张备选牌',
  `candidate_card_json` JSON NULL COMMENT '当前 4 张备选牌快照',
  `ongoing_card_json` JSON NULL COMMENT '进行中动物牌快照',
  `board_snapshot_json` JSON NULL COMMENT '自身完整棋盘快照',
  `board_public_snapshot_json` JSON NULL COMMENT '对手可见棋盘快照',
  `room_token` VARCHAR(128) NOT NULL COMMENT '短时房间令牌',
  `room_token_expire_at` DATETIME(3) NOT NULL COMMENT '房间令牌过期时间',
  `final_score` INT NOT NULL DEFAULT 0 COMMENT '最终总分',
  `terrain_score` INT NOT NULL DEFAULT 0 COMMENT '地形分',
  `animal_score` INT NOT NULL DEFAULT 0 COMMENT '动物牌分',
  `placed_cube_count` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '已放置动物方块数',
  `result_type` VARCHAR(16) NOT NULL DEFAULT 'pending' COMMENT 'win/lose/draw/pending',
  `gold_reward` INT NOT NULL DEFAULT 0 COMMENT '金币奖励',
  `rank_star_change` INT NOT NULL DEFAULT 0 COMMENT '星级变化',
  `is_connected` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否在线',
  `last_heartbeat_at` DATETIME(3) NULL COMMENT '最后心跳时间',
  `disconnect_deadline_at` DATETIME(3) NULL COMMENT '断线重连截止时间',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`match_id`, `player_id`),
  UNIQUE KEY `uq_match_player_seat` (`match_id`, `seat_no`),
  UNIQUE KEY `uq_match_room_token` (`room_token`),
  KEY `idx_match_player_result` (`player_id`, `result_type`, `updated_at`),
  KEY `idx_match_player_token_expire` (`room_token_expire_at`),
  CONSTRAINT `fk_match_player_match` FOREIGN KEY (`match_id`) REFERENCES `match_room` (`match_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_match_player_player` FOREIGN KEY (`player_id`) REFERENCES `player_account` (`player_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_match_player_deck` FOREIGN KEY (`deck_id`) REFERENCES `player_deck` (`deck_id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='对局玩家子表';

CREATE TABLE IF NOT EXISTS `match_action_log` (
  `log_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `match_id` BIGINT UNSIGNED NOT NULL,
  `turn_no` INT UNSIGNED NOT NULL COMMENT '回合数',
  `step_no` INT UNSIGNED NOT NULL COMMENT '步骤号',
  `player_id` BIGINT UNSIGNED NOT NULL,
  `request_id` VARCHAR(64) NOT NULL DEFAULT '' COMMENT '请求 ID',
  `client_action_id` VARCHAR(64) NULL COMMENT '客户端动作唯一 ID',
  `action_type` VARCHAR(32) NOT NULL COMMENT '动作类型',
  `action_payload` JSON NOT NULL COMMENT '动作载荷',
  `action_status` TINYINT NOT NULL DEFAULT 1 COMMENT '1 成功 0 拒绝 2 恢复写入',
  `state_version_before` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '动作前状态版本',
  `state_version_after` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '动作后状态版本',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`log_id`),
  UNIQUE KEY `uq_match_action_idempotent` (`match_id`, `player_id`, `client_action_id`),
  KEY `idx_match_action_order` (`match_id`, `turn_no`, `step_no`, `created_at`),
  KEY `idx_match_action_type` (`match_id`, `action_type`, `created_at`),
  CONSTRAINT `fk_action_log_match` FOREIGN KEY (`match_id`) REFERENCES `match_room` (`match_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_action_log_player` FOREIGN KEY (`player_id`) REFERENCES `player_account` (`player_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='对局动作日志表';

CREATE TABLE IF NOT EXISTS `match_result` (
  `match_id` BIGINT UNSIGNED NOT NULL,
  `winner_player_id` BIGINT UNSIGNED NULL COMMENT '胜者玩家',
  `end_reason` VARCHAR(32) NOT NULL DEFAULT 'normal_finish' COMMENT '结束原因',
  `rank_affected` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否影响排位',
  `result_json` JSON NOT NULL COMMENT '完整结算快照',
  `settle_version` VARCHAR(16) NOT NULL DEFAULT 'v1' COMMENT '结算规则版本',
  `is_verified` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已服务端复算校验',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`match_id`),
  KEY `idx_match_result_winner` (`winner_player_id`, `created_at`),
  CONSTRAINT `fk_match_result_match` FOREIGN KEY (`match_id`) REFERENCES `match_room` (`match_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_match_result_winner` FOREIGN KEY (`winner_player_id`) REFERENCES `player_account` (`player_id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='对局结算表';

CREATE TABLE IF NOT EXISTS `anti_cheat_event` (
  `event_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `player_id` BIGINT UNSIGNED NULL,
  `match_id` BIGINT UNSIGNED NULL,
  `event_type` VARCHAR(32) NOT NULL COMMENT '异常类型',
  `event_level` TINYINT NOT NULL DEFAULT 1 COMMENT '风险等级',
  `event_code` INT NOT NULL DEFAULT 7007 COMMENT '推荐关联错误码',
  `event_payload` JSON NOT NULL COMMENT '事件详情',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`event_id`),
  KEY `idx_anti_cheat_player_time` (`player_id`, `created_at`),
  KEY `idx_anti_cheat_match_time` (`match_id`, `created_at`),
  KEY `idx_anti_cheat_type_level` (`event_type`, `event_level`),
  CONSTRAINT `fk_anti_cheat_player` FOREIGN KEY (`player_id`) REFERENCES `player_account` (`player_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_anti_cheat_match` FOREIGN KEY (`match_id`) REFERENCES `match_room` (`match_id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='风控与异常事件表';

CREATE TABLE IF NOT EXISTS `client_version_log` (
  `log_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `player_id` BIGINT UNSIGNED NULL COMMENT '玩家 ID',
  `device_id` VARCHAR(128) NOT NULL DEFAULT '' COMMENT '设备 ID',
  `platform` VARCHAR(32) NOT NULL DEFAULT 'taptap_android' COMMENT '平台',
  `client_version` VARCHAR(32) NOT NULL COMMENT '客户端版本',
  `min_supported_version` VARCHAR(32) NOT NULL DEFAULT '' COMMENT '最低支持版本',
  `is_blocked` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否被最低版本拦截',
  `remark` VARCHAR(255) NOT NULL DEFAULT '' COMMENT '附加说明',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`log_id`),
  KEY `idx_client_version_platform_time` (`platform`, `client_version`, `created_at`),
  KEY `idx_client_version_player_time` (`player_id`, `created_at`),
  CONSTRAINT `fk_client_version_player` FOREIGN KEY (`player_id`) REFERENCES `player_account` (`player_id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='客户端版本接入日志表';

SET FOREIGN_KEY_CHECKS = 1;
