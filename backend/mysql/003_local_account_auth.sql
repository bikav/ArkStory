USE `zoo_harmony`;

CREATE TABLE IF NOT EXISTS `local_account_credential` (
  `player_id` BIGINT UNSIGNED NOT NULL,
  `account_name` VARCHAR(64) NOT NULL COMMENT '规范化后的本地账号名',
  `password_salt` VARCHAR(64) NOT NULL COMMENT 'scrypt salt',
  `password_hash` VARCHAR(128) NOT NULL COMMENT 'scrypt hash',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`player_id`),
  UNIQUE KEY `uq_local_account_name` (`account_name`),
  CONSTRAINT `fk_local_account_player`
    FOREIGN KEY (`player_id`) REFERENCES `player_account` (`player_id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_0900_ai_ci
  COMMENT='本地账号密码凭证表';
