# Zoo Harmony MySQL

这套 MySQL 脚本是根据 `docs/` 下的以下文档整理出来的：

- `动物园和声_服务端数据表设计_v1.md`
- `动物园和声_接口清单_v1.md`
- `动物园和声_结算与匹配规则_v1.md`
- `动物园和声_WebSocket事件协议_v1.md`
- `动物园和声_错误码设计_v1.md`

## 目录说明

- `001_init_schema.sql`：初始化数据库和全部核心表
- `002_seed_data.sql`：初始化基础配置、赛季、公告、卡池等种子数据
- `003_local_account_auth.sql`：补充本地账号密码登录所需凭证表

## 建库范围

除了文档中明确列出的核心业务表，本目录还补齐了接口落地时必需的几类数据：

- 登录会话：`player_session`
- 基础配置和卡牌版本：`app_config`、`card_config_version`
- 公告：`system_announcement`
- 卡池：`gacha_pool`
- 匹配队列：`matchmaking_queue`
- 好友房：`friend_room`、`friend_room_player`
- WebSocket 房间 token、心跳和重连字段：落在 `match_player`
- 幂等动作日志：扩展在 `match_action_log`

## 初始化方式

```sql
SOURCE backend/mysql/001_init_schema.sql;
SOURCE backend/mysql/002_seed_data.sql;
SOURCE backend/mysql/003_local_account_auth.sql;
```

如果你从命令行导入，也可以直接执行：

```bash
mysql -u root -p < backend/mysql/001_init_schema.sql
mysql -u root -p zoo_harmony < backend/mysql/002_seed_data.sql
mysql -u root -p zoo_harmony < backend/mysql/003_local_account_auth.sql
```

## 主要表分组

- 账号与会话：`player_account`、`player_profile`、`player_session`
- 本地账号凭证：`local_account_credential`
- 玩家资产：`player_resource`、`reward_log`、`player_card_inventory`
- 构筑：`player_deck`、`player_deck_card`
- 抽卡：`gacha_pool`、`gacha_log`
- 赛季排位：`season_info`、`player_rank`
- 匹配与房间：`matchmaking_queue`、`friend_room`、`friend_room_player`
- 对局：`match_room`、`match_player`、`match_action_log`、`match_result`
- 审计与风控：`anti_cheat_event`、`client_version_log`

## 当前假设

1. 静态卡牌配置继续使用 `docs/动物园和声_卡牌配置表_json草案_v1.json`，不入业务主表。
2. 排行榜直接从 `player_rank` 计算，不额外维护快照表。
3. WebSocket 幂等通过 `match_action_log` 的唯一键 `(match_id, player_id, client_action_id)` 保证。
4. 房间短时令牌放在 `match_player.room_token`，便于按玩家维度做重连校验。
5. `selected_deck_id`、`matchmaking_queue.match_id`、`friend_room.match_id` 保留字段与索引，但不做反向外键，避免初始化阶段的循环依赖。

## 下一步建议

如果要继续往后端实现推进，最顺手的下一步是：

1. 基于这些表定义生成 ORM 模型
2. 实现 `auth`、`deck`、`matchmaking` 三组 P0 接口
3. 为 `reward_log`、`match_result`、`match_action_log` 增加事务化写入逻辑
