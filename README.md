# 报价系统 Node 服务版

这是新的干净版本，不依赖 Tauri。数据保存在本地 SQLite 数据库：

`data/quote-data.sqlite`

功能包括案例报价管理、案例报价删除、客户名称/电话/地址维护、价格库维护、价格版本删除和 PDF 打印。

数据库分表保存：
- `customers`：案例报价内部客户信息兼容表
- `quotes`：案例报价
- `quote_lines`：报价明细
- `price_versions`：价格版本
- `price_items`：价格条目
- `app_state`：当前选中的页面、客户、报价等状态

正式数据只保存在 `quote-data.sqlite`。`public/data/initial-prices.json` 只用于首次初始化默认价格库。

运行：

```powershell
cd "D:\onedrive\Desktop\codex测试目录\quote-node-service"
node server.js
```

打开：

`http://127.0.0.1:5177`

也可以双击 `start.bat` 启动。

如果你一定要用 pnpm，可以任选一种方式：

```powershell
npx pnpm@9.15.4 dev
```

或用管理员权限打开终端后再执行 `corepack enable`。当前项目没有第三方依赖，所以不执行 `pnpm install` 也能运行。
