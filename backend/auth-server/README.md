# ArkStory Auth Server

这是给 `LoginScene` 配套的本地账号注册 / 登录服务，职责很简单：

1. 接收 Cocos 客户端的注册与登录请求
2. 写入 / 读取 MySQL 中的账号信息和会话信息
3. 返回 `access_token`、`refresh_token` 和基础玩家信息

## 目录

- `src/server.js`：鉴权服务入口
- `.env.example`：数据库和端口配置模板

## 依赖安装

在本目录执行：

```bash
npm install
```

## 启动前准备

1. 先执行 `backend/mysql/001_init_schema.sql`
2. 再执行 `backend/mysql/002_seed_data.sql`
3. 再执行 `backend/mysql/003_local_account_auth.sql`
4. 复制 `.env.example` 为 `.env`，填入你的 MySQL 账号密码

## 启动

```bash
npm start
```

默认会监听 `http://127.0.0.1:3000`。

## 已实现接口

- `GET /api/v1/health`
- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `GET /api/v1/player/profile`

## LoginScene 对接说明

客户端默认请求 `http://127.0.0.1:3000`。如果你后面改了服务地址，可以在运行环境里覆盖：

```ts
(globalThis as any).ARKSTORY_API_BASE_URL = 'http://你的地址:端口';
```
