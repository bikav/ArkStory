# 《动物园和声》WebSocket 事件协议 v1

## 1. 文档目的

本文件用于定义《动物园和声》MVP 阶段的实时对局 WebSocket 事件协议。

平台口径说明：

- 正文默认按 `TapTap Android 首发` 编写
- 实时对局协议本身为平台无关协议
- 微信小游戏相关差异说明统一放在文末“微信小游戏适配参考”章节

设计目标：

1. 明确客户端与服务端之间的实时消息结构
2. 统一事件命名、字段约束和错误处理方式
3. 支撑 1v1 对局、断线重连、回放和服务端复算
4. 为客户端联调、服务端实现和测试验收提供统一标准

## 2. 协议范围

本协议覆盖以下内容：

1. WebSocket 建连
2. 对局加入与初始化
3. 回合内动作提交
4. 服务端状态广播
5. 错误与异常事件
6. 断线重连与状态恢复
7. 对局结束通知

本协议不覆盖以下内容：

1. HTTP 登录与匹配接口
2. 抽卡、牌库构筑等非实时模块
3. 支付、公告、排行榜等大厅能力

## 3. 连接方式

连接地址示例：

```text
wss://api.example.com/ws/v1/match?match_id=90001&token=xxx
```

说明：

- `match_id`：对局 ID
- `token`：短时房间令牌，建议由 HTTP 匹配成功接口下发

连接建立后：

1. 客户端必须先发送 `match.join`
2. 服务端校验对局归属、房间状态和 token 有效性
3. 校验通过后返回 `match.join_ack`

## 4. 设计原则

1. 服务端权威：所有对局合法性和最终状态以服务端为准
2. 客户端提交意图：客户端发送动作意图，不直接声明结算结果
3. 幂等优先：关键动作必须携带 `client_action_id`
4. 顺序可校验：所有服务端广播应带 `state_version`
5. 可恢复：断线后客户端可通过快照恢复到最新状态

## 5. 通用消息结构

所有 WebSocket 消息统一使用 JSON，建议结构如下：

```json
{
  "event": "match.join",
  "request_id": "req_001",
  "client_action_id": "act_001",
  "timestamp": 1760000000,
  "data": {}
}
```

字段说明：

- `event`：事件名
- `request_id`：请求唯一标识，用于日志追踪
- `client_action_id`：客户端动作唯一标识，用于幂等处理
- `timestamp`：客户端发送时间戳
- `data`：事件载荷

服务端返回建议结构：

```json
{
  "event": "match.join_ack",
  "request_id": "req_001",
  "server_event_id": "sev_10001",
  "state_version": 1,
  "timestamp": 1760000001,
  "code": 0,
  "message": "ok",
  "data": {}
}
```

字段说明：

- `server_event_id`：服务端事件唯一 ID
- `state_version`：对局状态版本号，每次有效状态变化后递增
- `code`：0 表示成功，非 0 表示错误
- `message`：错误信息或成功提示

## 6. 事件命名规范

命名规则：

1. 客户端请求事件使用 `match.xxx`
2. 服务端确认事件使用 `match.xxx_ack`
3. 服务端广播事件使用 `match.xxx_notify` 或 `match.state_update`
4. 错误事件统一使用 `match.error`

示例：

- `match.join`
- `match.join_ack`
- `match.pick_terrain_group`
- `match.pick_terrain_group_ack`
- `match.state_update`

## 7. 对局核心状态模型

服务端维护的核心状态至少包括：

1. `match_id`
2. `room_status`
3. `turn_player_id`
4. `turn_no`
5. `step_status`
6. `state_version`
7. 双方版图
8. 双方牌库与备选牌区状态
9. 中央地形市场
10. 地形袋剩余数量
11. 行动日志

推荐状态值：

- `room_status`：
  - `waiting`
  - `playing`
  - `ending`
  - `finished`
- `step_status`：
  - `pick_terrain_group`
  - `place_terrain`
  - `optional_pick_card`
  - `optional_place_cube`
  - `ready_to_end_turn`

## 8. 回合流程约束

单回合标准流程：

1. 当前玩家选择 1 组地形
2. 当前玩家放置本回合取得的 3 枚地形
3. 当前玩家可选从 4 张备选动物牌中拿 1 张进入进行中区域
4. 当前玩家可选放置任意个满足条件的动物方块
5. 当前玩家结束回合
6. 服务端补充中央地形市场
7. 若本回合拿过动物牌，补充 1 张备选牌
8. 服务端切换回合

服务端必须校验：

1. 未选择地形组前不能直接放地形
2. 未放完 3 枚地形前不能结束回合
3. 进行中动物牌已满 4 张时，不能拿新牌
4. 动物方块只能放置到满足对应图案要求的位置

## 9. 建连与初始化事件

## 9.1 `match.join`

用途：

- 客户端加入对局房间

请求示例：

```json
{
  "event": "match.join",
  "request_id": "req_join_001",
  "timestamp": 1760000000,
  "data": {
    "match_id": 90001,
    "resume": false
  }
}
```

字段说明：

- `resume`：是否为断线重连

## 9.2 `match.join_ack`

用途：

- 服务端返回对局初始化快照

返回示例：

```json
{
  "event": "match.join_ack",
  "request_id": "req_join_001",
  "server_event_id": "sev_10001",
  "state_version": 1,
  "code": 0,
  "message": "ok",
  "data": {
    "match_id": 90001,
    "room_status": "playing",
    "turn_no": 1,
    "turn_player_id": 1001,
    "self_player_id": 1001,
    "step_status": "pick_terrain_group",
    "terrain_market": [
      {"group_index": 0, "pieces": ["WT", "BN", "YL"]},
      {"group_index": 1, "pieces": ["WT", "WT", "RD"]},
      {"group_index": 2, "pieces": ["BN", "GN", "YL"]},
      {"group_index": 3, "pieces": ["GY", "WT", "BN"]},
      {"group_index": 4, "pieces": ["YL", "RD", "BN"]}
    ],
    "terrain_bag_remaining": 105,
    "self_candidate_cards": ["W01", "B03", "G01", "W08"],
    "self_ongoing_cards": [],
    "opponent_ongoing_count": 1,
    "self_board_snapshot": {},
    "opponent_board_public_snapshot": {}
  }
}
```

说明：

- `self_candidate_cards`：自己当前的 4 张备选动物牌
- `opponent_ongoing_count`：对手进行中动物牌数量，MVP 可先不公开具体卡牌

## 10. 客户端动作事件

## 10.1 `match.pick_terrain_group`

用途：

- 当前玩家选择中央市场中的 1 组地形

请求示例：

```json
{
  "event": "match.pick_terrain_group",
  "request_id": "req_turn_001",
  "client_action_id": "act_pick_group_001",
  "timestamp": 1760000100,
  "data": {
    "group_index": 2
  }
}
```

服务端校验：

1. 必须轮到当前玩家
2. 当前步骤必须是 `pick_terrain_group`
3. `group_index` 必须有效

成功确认事件：

- `match.pick_terrain_group_ack`

成功后广播：

- `match.state_update`

## 10.2 `match.place_terrain`

用途：

- 当前玩家提交本回合 3 枚地形的放置结果

请求示例：

```json
{
  "event": "match.place_terrain",
  "request_id": "req_turn_002",
  "client_action_id": "act_place_terrain_001",
  "timestamp": 1760000110,
  "data": {
    "group_index": 2,
    "placements": [
      {"piece_order": 0, "terrain_code": "BN", "q": 0, "r": 0, "target_height": 0},
      {"piece_order": 1, "terrain_code": "GN", "q": 1, "r": 0, "target_height": 1},
      {"piece_order": 2, "terrain_code": "YL", "q": 1, "r": -1, "target_height": 0}
    ]
  }
}
```

服务端校验：

1. 必须轮到当前玩家
2. 当前步骤必须是 `place_terrain`
3. 必须恰好放置 3 枚
4. 3 枚地形必须与已选中的地形组一致
5. 坐标、叠放高度和版图规则合法

成功确认事件：

- `match.place_terrain_ack`

成功后广播：

- `match.state_update`

## 10.3 `match.pick_animal_card`

用途：

- 当前玩家从 4 张备选动物牌中选择 1 张，放入进行中区域

请求示例：

```json
{
  "event": "match.pick_animal_card",
  "request_id": "req_turn_003",
  "client_action_id": "act_pick_card_001",
  "timestamp": 1760000120,
  "data": {
    "card_id": "B03"
  }
}
```

服务端校验：

1. 必须轮到当前玩家
2. 当前步骤必须处于 `optional_pick_card` 或 `optional_place_cube`
3. `card_id` 必须存在于玩家当前 4 张备选区
4. 玩家进行中动物牌数量不能超过 4
5. 每回合最多执行 1 次拿牌动作

成功确认事件：

- `match.pick_animal_card_ack`

成功后广播：

- `match.state_update`

## 10.4 `match.place_animal_cube`

用途：

- 当前玩家向某张进行中动物牌放置 1 个动物方块

请求示例：

```json
{
  "event": "match.place_animal_cube",
  "request_id": "req_turn_004",
  "client_action_id": "act_place_cube_001",
  "timestamp": 1760000130,
  "data": {
    "card_id": "B03",
    "placement_q": 2,
    "placement_r": -1
  }
}
```

服务端校验：

1. 必须轮到当前玩家
2. `card_id` 必须属于当前玩家进行中动物牌
3. 该卡必须仍有剩余方块槽位
4. 落点坐标必须为空
5. 对应图案要求必须满足

成功确认事件：

- `match.place_animal_cube_ack`

成功后广播：

- `match.state_update`

说明：

- 同一回合可多次发送本事件，直到玩家主动结束回合

## 10.5 `match.end_turn`

用途：

- 当前玩家结束回合

请求示例：

```json
{
  "event": "match.end_turn",
  "request_id": "req_turn_005",
  "client_action_id": "act_end_turn_001",
  "timestamp": 1760000140,
  "data": {}
}
```

服务端校验：

1. 必须轮到当前玩家
2. 必须已经完成地形组选择和 3 枚地形放置
3. 所有已提交动作已落库

服务端处理：

1. 结算本回合已完成的动物牌阶段
2. 若本回合拿过动物牌，则从剩余牌库补 1 张备选牌
3. 补足中央地形市场
4. 检查终局条件
5. 若未终局，切换回合

成功确认事件：

- `match.end_turn_ack`

成功后广播：

- `match.turn_change`
- `match.state_update`

## 10.6 `match.heartbeat`

用途：

- 保持连接活性

请求示例：

```json
{
  "event": "match.heartbeat",
  "request_id": "req_ping_001",
  "timestamp": 1760000200,
  "data": {}
}
```

服务端返回：

- `match.heartbeat_ack`

建议：

- 客户端每 15 秒发送一次
- 60 秒未收到心跳可判定连接失活

## 11. 服务端广播事件

## 11.1 `match.state_update`

用途：

- 广播最新权威状态

触发时机：

1. 成功选择地形组后
2. 成功放置地形后
3. 成功拿动物牌后
4. 成功放置动物方块后
5. 回合结束后
6. 状态恢复后

返回示例：

```json
{
  "event": "match.state_update",
  "server_event_id": "sev_10010",
  "state_version": 8,
  "timestamp": 1760000141,
  "data": {
    "match_id": 90001,
    "turn_no": 2,
    "turn_player_id": 1002,
    "step_status": "pick_terrain_group",
    "terrain_market": [],
    "terrain_bag_remaining": 99,
    "self_candidate_cards": ["W01", "G01", "W08", "B05"],
    "self_ongoing_cards": [
      {"card_id": "B03", "placed_cube_count": 1, "cube_slots": 3, "score_preview": 2}
    ],
    "opponent_ongoing_count": 2,
    "last_action": {
      "player_id": 1001,
      "action_type": "end_turn"
    }
  }
}
```

## 11.2 `match.turn_change`

用途：

- 明确通知双方回合切换

返回字段建议：

- `from_player_id`
- `to_player_id`
- `turn_no`

## 11.3 `match.action_notify`

用途：

- 可选的轻量动作广播

说明：

- 如果客户端希望先播放动作动画，再等全量快照，可补发本事件
- MVP 允许只依赖 `match.state_update`

## 11.4 `match.end`

用途：

- 广播对局结束

触发时机：

1. 正常终局
2. 投降
3. 超时判负
4. 异常中断后服务端判定结果

返回示例：

```json
{
  "event": "match.end",
  "server_event_id": "sev_10100",
  "state_version": 56,
  "timestamp": 1760000900,
  "data": {
    "match_id": 90001,
    "end_reason": "normal_finish",
    "winner_player_id": 1002,
    "result_ready": true
  }
}
```

说明：

- 客户端收到后，再调用 HTTP 结算接口拉取完整结果

## 12. 错误事件协议

## 12.1 `match.error`

用途：

- 返回动作级错误

返回示例：

```json
{
  "event": "match.error",
  "request_id": "req_turn_004",
  "server_event_id": "sev_10020",
  "state_version": 8,
  "timestamp": 1760000131,
  "code": 5004,
  "message": "animal cube placement invalid",
  "data": {
    "failed_event": "match.place_animal_cube",
    "retryable": false
  }
}
```

建议错误码：

- `5001`：当前不在你的回合
- `5002`：当前步骤不允许执行该动作
- `5003`：地形组选择非法
- `5004`：地形放置非法
- `5005`：动物牌不在备选区
- `5006`：进行中动物牌已满
- `5007`：动物方块图案条件不满足
- `5008`：回合尚未完成必要步骤
- `5009`：重复动作提交
- `5010`：状态版本过旧

## 13. 断线重连协议

## 13.1 重连方式

客户端断线后应：

1. 重建 WebSocket 连接
2. 再次发送 `match.join`
3. 设置 `resume = true`
4. 携带客户端记录的 `last_state_version`

请求示例：

```json
{
  "event": "match.join",
  "request_id": "req_resume_001",
  "timestamp": 1760000300,
  "data": {
    "match_id": 90001,
    "resume": true,
    "last_state_version": 18
  }
}
```

## 13.2 状态恢复

服务端收到重连请求后：

1. 校验玩家身份和房间归属
2. 返回当前最新快照
3. 若支持增量补发，可根据 `last_state_version` 补发缺失事件
4. 若无法保证增量完整性，直接下发全量快照

MVP 建议：

- 直接返回最新全量快照
- 不强制实现增量补包

## 13.3 `match.resume_ack`

用途：

- 明确表示重连恢复成功

返回字段建议：

- `match_id`
- `state_version`
- `turn_no`
- `turn_player_id`
- `step_status`
- `self_candidate_cards`
- `self_ongoing_cards`
- `terrain_market`
- `full_snapshot`

## 14. 超时与托管

MVP 建议先定义超时协议，不强制实现复杂托管：

1. 单回合超时后，服务端可直接判负
2. 若后续做托管，可新增 `match.auto_play_notify`

建议字段：

- `turn_deadline_ts`
- `remaining_seconds`

可在 `match.state_update` 中返回，便于前端倒计时显示。

## 15. 幂等与防重

关键动作必须带 `client_action_id`：

1. `match.pick_terrain_group`
2. `match.place_terrain`
3. `match.pick_animal_card`
4. `match.place_animal_cube`
5. `match.end_turn`

服务端处理原则：

1. 同一玩家、同一对局、同一 `client_action_id` 的重复请求只处理一次
2. 若已成功处理，直接返回之前的确认结果
3. 若客户端状态落后，返回最新 `state_version`

## 16. 安全与校验要求

服务端必须做以下校验：

1. 房间令牌有效性
2. 当前玩家身份归属
3. 当前回合归属
4. 当前步骤合法性
5. 地形和动物图案规则校验
6. 所有分数和完成度由服务端计算

客户端不得做以下假设：

1. 自己本地预计算就是最终结果
2. 可以跳过步骤直接提交后续动作
3. 可以自行决定终局

## 17. 联调建议

联调顺序建议：

1. `match.join / match.join_ack`
2. `match.pick_terrain_group`
3. `match.place_terrain`
4. `match.end_turn`
5. `match.pick_animal_card`
6. `match.place_animal_cube`
7. `match.state_update / match.end`
8. `match.error`
9. 断线重连

建议先做“全量快照流”，后做“动作动画流”。

## 18. MVP 最小事件集

MVP 必做事件：

1. `match.join`
2. `match.join_ack`
3. `match.pick_terrain_group`
4. `match.pick_terrain_group_ack`
5. `match.place_terrain`
6. `match.place_terrain_ack`
7. `match.pick_animal_card`
8. `match.pick_animal_card_ack`
9. `match.place_animal_cube`
10. `match.place_animal_cube_ack`
11. `match.end_turn`
12. `match.end_turn_ack`
13. `match.state_update`
14. `match.error`
15. `match.end`
16. `match.heartbeat`
17. `match.heartbeat_ack`

MVP 可选事件：

1. `match.action_notify`
2. `match.resume_ack`
3. `match.auto_play_notify`

## 19. 后续建议

在本文件基础上，下一步建议继续补：

1. `动物园和声_错误码设计_v1.md`
2. `动物园和声_结算与匹配规则_v1.md`
3. `动物园和声_UI线框说明_v1.md`
4. `动物园和声_PRD_v1.md`

## 20. 微信小游戏适配参考

以下内容仅作为后续适配微信小游戏时的参考，不影响 TapTap Android 首发协议主流程：

1. WebSocket 事件结构可保持不变。
2. 连接鉴权参数可由微信登录态换取的房间 token 驱动。
3. 前后台切换更频繁，断线重连逻辑应比 Android 版本更积极。
4. 若微信小游戏环境对长连接稳定性有额外限制，可保留 HTTP 轮询兜底方案，但不建议作为主路径。
