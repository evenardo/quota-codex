# 报价系统 Node 服务版

这是本地 Node + SQLite 版本，不依赖 Tauri。

## 数据位置

正式工作数据只保存在：

```text
data/quote-data.sqlite
```

旧的 `public/data/initial-prices.json` 已删除，程序不会再从 JSON 初始化、恢复或覆盖数据库。

## 备份

手动点击页面上的“备份数据库”按钮，会在这里生成一个完整 SQLite 备份：

```text
data/backups/quote-data-manual-年月日时分秒毫秒.sqlite
```

服务启动后还会自动定时备份：

```text
data/backups/quote-data-auto-年月日时分秒毫秒.sqlite
```

自动备份默认每 30 分钟执行一次，默认保留最近 80 个自动备份。手动备份不会被自动清理。

可以用环境变量调整：

```powershell
$env:BACKUP_INTERVAL_MINUTES="30"
$env:BACKUP_KEEP="80"
pnpm dev
```

备份使用 SQLite 的 `VACUUM INTO` 生成一致的 `.sqlite` 文件，比直接复制数据库文件更稳。

## 运行

```powershell
cd "D:\onedrive\Desktop\codex测试目录\quote-node-service"
pnpm dev
```

然后打开：

```text
http://127.0.0.1:5177
```

如果端口提示被占用，说明服务已经在运行，直接打开上面的地址即可。
