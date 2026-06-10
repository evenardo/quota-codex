# Codex Project Memory

本文件用于在聊天记录丢失或上下文被压缩后，帮助 Codex 快速恢复项目背景。它不是逐字聊天记录，而是按功能、设计决策、数据结构和后续约定整理的项目记忆。

## 如何维护这份文档

这份 `Codex.md` 是项目的长期交接记忆。以后新的 Codex 接手时，应把它当作第一上下文来源之一；当前 Codex 每次做出重要设计、功能、数据结构或用户偏好变更时，也应在这里留下痕迹。

维护原则：

- 重要对话要留痕：只要用户明确表达了新的业务规则、交互偏好、命名约定、数据设计、计算逻辑或未完成任务，就应更新本文件。
- 功能实现后要更新状态：完成、部分完成、废弃、改名、迁移数据库字段，都要在对应章节体现。
- 不需要逐字记录聊天：优先写成可接手的决策摘要，说明“现在是什么、为什么这样、以后注意什么”。
- 小样式微调可合并记录：例如对齐、颜色、按钮位置等，不必每次写长段，但如果形成稳定偏好，应归纳到 `排版和交互偏好`。
- 数据库和计算逻辑必须记录：任何新增表、字段、金额公式、排序规则、备份规则，都要写进 `当前数据模型速查` 或相关模块。
- 未完成事项必须明确状态：不要只写“讨论过”，要写“已分析未实现”“部分实现”“建议下一步”。
- 不要删除历史决策，除非它已经明确废弃；废弃时写清楚“曾经有过，后来取消”，避免新的 Codex 误以为是遗漏。
- 每次较大改动后，在文末 `交接日志` 追加一条日期记录，包含用户诉求、处理结果、测试情况和后续风险。

建议追加格式：

```markdown
### YYYY-MM-DD HH:mm

- 用户诉求：一句话说明这次用户真正想要什么。
- 处理结果：列出实际改动或形成的设计决策。
- 涉及文件：`public/app.js`、`server.js` 等。
- 测试情况：是否运行 `npm test`，结果如何；若未运行，说明原因。
- 后续注意：还有哪些没做、容易误解或下次要继续的点。
```

如果只是纯提问或纯解释，没有形成新的项目规则，可以不追加交接日志；但如果这次解释会影响后续实现，例如“起步价应折算进 PDF 单价”，就必须记录。

## 项目概况

这是一个本地装修报价工具，当前实现为干净的 Node.js 服务，不使用 Tauri。

- 项目目录：`D:\onedrive\Desktop\codex测试目录\quote-node-service`
- 启动方式：`npm run dev`
- 测试方式：`npm test`
- 默认地址：`http://127.0.0.1:5177/`
- 前端：原生 HTML/CSS/JavaScript，主要文件为 `public/app.js`、`public/styles.css`
- 后端：`server.js`
- JSDoc 类型文件：`public/types.js`、`server-types.js`
- 数据库：SQLite，文件为 `data/quote-data.sqlite`
- 自动备份目录：`data/backups`
- 包管理器：已从 `pnpm` 改为 `npm`
- 用户偏好：命令行优先使用 Git Bash

## 核心目标

工具用于给不同案例做装修报价，支持：

- 管理案例报价
- 编辑工程量
- 管理工费库
- 管理主材库
- 维护模板库
- 维护套餐库
- 生成 PDF 报价单
- 本地 SQLite 持久化
- 自动数据库备份
- 用 `npm test` 做较完整回归测试

## 重要命名约定

这些中文命名是当前前台语义基准：

- `报价单` 已改为 `工程量`
- `空间` 已演进为 `项目组合`
- `工费` 前台显示为 `清工辅料`
- `主材` 前台显示为 `装修主材`
- `价格库` 已改为 `工费库`
- `通用主材` 已改为 `抽象主材`
- 实际产品层称为 `供货商主材`
- 工程项目名称显示为 `工程项目名称`
- 主材项目名称显示为 `主材项目名称`

代码内部还有一些旧命名，例如 `genericMaterial`，当前为了安全没有完全重命名。以后如果做大重构，应以当前前台中文命名为准逐步替换。

## 数据存储

当前不再使用单一 JSON 文件作为主存储。

- 主数据存储在 SQLite：`data/quote-data.sqlite`
- `quota-data.json` 已删除或不再作为主数据源
- `initial-prices.json` 不应再作为会覆盖数据库的初始化来源
- 自动备份使用 SQLite 备份文件

备份策略当前按时间分层保留：

- 每 10 分钟备份一次
- 1 小时内保留 6 份
- 12 小时内每小时保留 2 份
- 12 到 24 小时内每小时保留 1 份
- 1 到 7 天每天保留 1 份
- 7 天到 1 个月每周保留 1 份
- 1 个月以上每月保留 1 份

## ID 约定

用户曾讨论过自增 ID 变大、排序和数据安全问题。当前方向是：

- 使用 `前缀 + uuidv7` 风格 ID
- 比 `Date.now() + Math.random()` 更适合排序和避免冲突
- 保留前缀便于人工排查数据类型

## 工费库

工费库维护清工辅料项目。

关键规则：

- 工费名称必须带斜杠单位，例如 `水电开槽/平米`
- 用户忘写斜杠时，不应让名称被错误保存，也要允许继续编辑修正
- 单位从名称中提取
- 工费库中项目可排序
- 类目库在工费库上方，默认折叠，可拖动排序
- 工费条目排序跟随类目库排序；类目内可小排序
- 别名功能已实现：
  - 别名作为正常行显示在正主工费项下方
  - 别名可编辑名称
  - 搜索可匹配别名
  - 选择别名后，报价显示别名，但底层关联正主工费项
  - 刷新后别名应保存在 SQLite 中
- 工费族功能曾讨论并实现过一部分，后来决定去掉

工费库字段曾多次调整，目前前台主要关注：

- 工程项目名称
- 单价
- 辅料
- 成本单价
- 成本辅料
- 推荐工程量公式
- 是否向下取整
- 工艺说明
- 别名

待实现/已分析但未执行：

- 工费项目起步价
- 起步价应只约束工费部分，不影响辅料
- 内部计算建议：
  - `辅料金额 = 工程量 * 辅料`
  - `人工金额 = max(工程量 * 单价, 起步价)`
  - `金额 = 辅料金额 + 人工金额`
  - 成本也应有对应的 `成本起步价`
- PDF 中建议把起步价折算到展示单价，不单独露出起步价列

## 主材库

主材库已经分成两层：

1. `抽象主材`
2. `供货商主材`

抽象主材用于报价、模板、套餐里的占位和统一口径，例如：

- 地砖
- 墙砖
- 门
- 地脚线
- 单边套
- 双边套
- 全屋定制
- 橱柜地柜
- 橱柜吊柜
- 坐便
- 花洒
- 浴室柜

供货商主材用于具体品牌、规格、报价和成本，例如：

- 宏陶地砖 800*800
- 马可波罗地砖 800*800
- 宏陶地砖 750*1500

当前设计约定：

- 报价、模板、套餐优先选择抽象主材
- 以后再匹配具体供货商主材
- 供货商主材可关联抽象主材
- 供货商主材的换算目标单位优先对齐关联的抽象主材单位
- 抽象主材和供货商主材是平级面板
- 两个面板均可折叠
- 平级只能展开一个

主材换算工具：

- 抽象主材和供货商主材都提供换算工具
- 成本和售价各有一份计算过程
- 例如：
  - 单个面积 `0.32`
  - 单个成本 `18`
  - 结果为 `18 / 0.32 = 56.25 元/平米`
- 换算过程必须保存到 SQLite，方便以后核算
- 字段包括成本换算面积、成本换算价格、报价换算面积、报价换算价格

## 报价编辑

报价编辑目前以 `项目组合` 为组织单位。

关键行为：

- 项目组合不再强制分清工辅料或主材
- 一个项目组合内可以同时有清工辅料和装修主材
- 行首显示类型：`清工辅料` 或 `装修主材`
- 工程项目和主材项目都在项目组合框架内添加
- 添加项目支持：
  - 按钮添加
  - 行间悬浮加号添加
  - 在指定位置添加，刚添加时不要立刻排序
  - 等刷新或重新加载后再按库顺序排序
- 用户称这种排序方式为：
  - 新增时保持插入位置
  - 重载后按库顺序归位
  - 可作为后续复用的排序模式

项目组合：

- 可拖动排序
- 可收缩展开
- 展开/收缩时数字不应消失
- 可从模板同步
- 同步模板时：
  - 项目组合已有项目不删除
  - 模板中有而当前没有的导入
  - 已有项目不要覆盖
- 删除项目组合时需要确认

行编辑体验：

- 工程量输入时，点击进入默认全选
- 输入后按回车相当于失焦，并给保存反馈
- 部位输入回车也要有反馈
- 不可编辑格子可跳转到对应工费库或主材库条目
- 从报价编辑跳转到库编辑后，再次点击单位/单价等触发收缩时，应能回到原报价位置

PDF：

- 保存 PDF 名称逻辑：`工程名 + 客户名 + 当前年月日时分秒`
- PDF 排版经过多次调整，但用户仍然对美观要求较高
- 可选择 `显示金额`
  - 默认勾选
  - 去掉后，报价单不显示辅料、单价、金额等列
  - 仍保留总量、总价、清工辅料小计、主材小计等汇总

## 模板库

模板库用于按常见项目组合快速生成报价内容。

当前原则：

- 模板可包含清工辅料和装修主材
- 添加模板项目时使用与报价编辑类似的输入查找方式，不用下拉列表
- 添加工费/主材默认应为空白，不要默认成某个项目
- 模板支持拖动排序
- 模板支持展开/收缩
- 同时只能展开一个模板
- 模板可复制
- 模板项目排序应与报价编辑使用相同的库排序逻辑
- 新增项目时不要马上排序，刷新后再归位
- 模板库添加项目也应支持行间悬浮加号
- 在模板库点击类目或对应不可编辑字段，可跳转到工费库/主材库对应条目，方便修改后返回

## 套餐库

套餐报价功能已进入设计和部分实现阶段。

用户常用的是 `清工辅料套餐`：

- 套餐说明用于表达清楚包含内容
- 可描述主材品牌、市场价值、施工内容
- 再额外加砖、门、地脚线、柜子、石英石台面、窗台板、蜂窝大板、水管升级、大循环、木工造型等套餐外项目

套餐功能方向：

- 套餐库类似工费库/主材库的独立模块
- 套餐有说明内容
- 套餐有成本测算
- 成本测算结构类似报价编辑/模板库
- 套餐测算可多套保存，用于评估不同户型和数量
- 套餐的项目组合可像模板一样维护
- 套餐库内容允许从模板库导入
- 套餐测算也可收缩，且只允许一个展开
- 套餐删除需要页面内简单确认

套餐报价未来方向：

- 报价编辑分为普通报价和套餐报价两种模式
- 套餐报价可从模板导入项目组合
- 项目可标记为包含在套餐中或进入差价部分
- 没有包含在套餐中的项目可以在差价部分以 0 数量保留，防止漏项，但不体现在最终报价呈现中

## 删除确认

全局删除策略已调整：

- 不再统一要求输入完整名称
- 改为页面内简单确认弹窗
- 弹窗里要清楚重复展示删除对象名称
- 以前已经明确要求输入名称的功能，后来也倾向统一为简单确认
- 不使用浏览器原生 `alert/prompt/confirm`，尽量使用页面内弹窗

## 排版和交互偏好

用户偏好：

- 密集、像 Excel、适合大量数据
- 不喜欢大块空白
- 不喜欢输入框、按钮对不齐
- 行间添加按钮应像一条线，悬浮出现加号，而不是很高的空白行
- 鼠标悬浮某行时，行背景轻微加深
- 拖动排序不能从输入框触发，避免编辑文本时误拖动
- 可点击展开/收缩的区域要足够大，不要只有小按钮能点
- 前台样式变化不必每次都补测试，可阶段性提醒统一补

常见 UI 决策：

- 工具页不是营销页，要直接进入可用界面
- 表格和表单要紧凑
- 按钮字体可以更小
- 字段名、输入框宽度需要按实际业务重要性分配
- 主材和清工辅料需要颜色区分，但不要太花

## 测试

项目已有测试，目标是以后改功能能较安心。

运行：

```bash
npm test
```

`npm test` 当前覆盖：

- 前台单元测试
- 后台 SQLite API 测试
- `server.js` 语法检查
- `public/app.js` 语法检查
- smoke test

最近一次已知测试结果：

- 39 个测试通过
- `server.js` 检查通过
- `app.js` 检查通过
- smoke test 通过

后续新增功能时，原则上应补测试，尤其是：

- 数据库字段保存/读取
- 报价计算
- 模板同步
- 套餐测算
- 工费/主材库重命名同步
- 删除确认
- 起步价计算

## 命令习惯

用户明确希望以后优先使用 Git Bash。

推荐命令形式：

```bash
cd quote-node-service
npm test
npm run dev
```

在 Codex 工具里常用：

```powershell
& 'C:\Program Files\Git\bin\bash.exe' -lc "cd quote-node-service && npm test"
```

## 近期未完成或可继续事项

1. 工费起步价功能
   - 已分析，尚未实现
   - 需要数据库字段、前台字段、报价计算、PDF 展示、套餐测算同步

2. 套餐报价模式
   - 已讨论方向
   - 需要更完整的数据结构和 UI

3. 主材具体产品匹配和补差价
   - 抽象主材和供货商主材已初步打通
   - 后续需要按具体产品匹配自动算差价
   - 可能需要工费规格联动，例如不同砖规格影响瓦工工费

4. 代码可读性重构
   - 前台 `app.js` 仍然很大
   - 已经做过部分函数整理
   - 以后可以逐步拆模块或 TypeScript 化
   - 用户关心改完后是否还能立即测试看到结果
   - 用户当前倾向尽快引入 TypeScript，但要求保持开发过程流畅，最好仍能 `npm run dev` 后快速刷新验证
   - 如果暂不迁移 TypeScript，则优先使用 JSDoc、测试、normalize 函数和小函数拆分来控制数据类型风险

5. 更广测试覆盖
   - 用户希望测试尽量完善
   - 风格小改可以不每次补，但功能改动应补

## 恢复上下文时的建议流程

如果 Codex 完全丢失聊天记忆，只能通过项目文件恢复上下文，建议按这个顺序阅读：

1. 先读本文件 `Codex.md`
2. 再读 `README.md`，确认项目启动说明是否有新增
3. 查看 `package.json` 的脚本，确认测试和启动命令
4. 快速读 `server.js` 的表结构和 API 路由
5. 快速读 `public/app.js` 的 `state`、`normalizeState`、`renderMaterials`、`renderLaborLibrary`、`renderLines`、`calculateTotals`
6. 快速读 `scripts/frontend.test.js` 和 `scripts/backend.test.js`，确认当前行为被哪些测试约束
7. 运行 `npm test`
8. 如果用户正在浏览器里指出 UI 问题，优先定位 `public/styles.css` 和对应 render 函数

恢复时需要特别确认：

- 当前用户是否已有运行中的 `npm run dev`
- 当前端口 `5177` 是否被占用
- `data/quote-data.sqlite` 是否存在且不是旧 JSON 恢复出来的错误数据
- 最近是否有未完成的中断任务
- 工作区是否有用户或其他工具改动，不能随意回退

## 当前功能状态表

| 模块 | 状态 | 说明 |
| --- | --- | --- |
| Node.js 服务 | 已完成 | `server.js` 提供静态文件和 `/api/data` 读写 SQLite |
| SQLite 主存储 | 已完成 | 主数据存储在 `data/quote-data.sqlite` |
| 自动备份 | 已完成 | 已有分层保留策略，备份在 `data/backups` |
| 案例报价管理 | 已完成 | 案例与客户信息合并为整体，案例可删除，删除用简单确认 |
| 报价编辑/工程量 | 已完成并持续迭代 | 支持项目组合、清工辅料、装修主材、PDF、显示金额开关 |
| 项目组合 | 已完成 | 可拖动排序、收缩展开、模板同步、行间加项目 |
| 工费库 | 已完成并持续迭代 | 类目、排序、别名、推荐工程量公式、向下取整、工艺说明 |
| 工费起步价 | 未实现 | 已分析公式和 PDF 展示逻辑 |
| 主材库 | 已完成并持续迭代 | 已分为抽象主材和供货商主材 |
| 抽象主材 | 已完成 | 可折叠，带成本/报价换算过程，过程保存进 SQLite |
| 供货商主材 | 已完成 | 可折叠，带成本/报价换算过程，目标单位对齐抽象主材 |
| 主材补差价 | 部分实现/待完善 | 已有抽象主材与具体主材价差基础，规格联动未完成 |
| 模板库 | 已完成并持续迭代 | 可排序、折叠、复制、行间添加、从库选择项目 |
| 套餐库 | 部分实现 | 有套餐说明和测算雏形，套餐报价模式仍需重构 |
| 删除确认 | 已完成 | 统一倾向页面内简单确认，不使用原生 prompt |
| 测试 | 已完成基础覆盖 | `npm test` 覆盖前后台、语法和 smoke test |
| 代码重构 | 部分完成 | `app.js` 仍很大，后续可逐步模块化或 TypeScript 化 |

## 当前数据模型速查

这些表来自 `server.js` 的 SQLite schema 和迁移逻辑。字段名以后可能继续演进，修改时必须做增量迁移，不要破坏旧数据。

### 应用状态

`app_state`

- 保存 UI 状态和返回上下文
- 关键状态包括 `activePage`、`activeVersionId`、`categoryLibraryCollapsed`、`genericMaterialLibraryCollapsed`、`supplierMaterialLibraryCollapsed`
- 还保存从报价/模板/套餐跳到库编辑后的返回锚点

### 工费库

`price_versions`

- 工费版本
- 字段：`id`、`name`、`created_at`

`labor_categories`

- 工费分类库
- 字段：`id`、`name`、`description`、`sort_order`
- 分类顺序影响工费条目和报价编辑重载排序

`labor_items`

- 工费条目
- 关键字段：
  - `id`
  - `version_id`
  - `sort_order`
  - `name`
  - `unit`
  - `aliases`
  - `category_id`
  - `description`
  - `auxiliary`
  - `labor`
  - `cost_auxiliary`
  - `cost_labor`
  - `unit_price`
  - `cost_unit_price`
  - `quantity_formula`
  - `quantity_round_down`
  - `uses_material`
  - `default_material_id`
- `aliases` 是 JSON 字符串，前台会 normalize 成数组
- 当前 `material`、`waste_rate` 等旧字段仍可能存在，但前台逻辑已多次调整，谨慎使用

### 主材库

`material_kinds`

- 当前前台叫 `抽象主材`
- 关键字段：
  - `id`
  - `sort_order`
  - `name`
  - `primary_category`
  - `unit`
  - `cost_unit_price`
  - `quote_unit_price`
  - `calc_cost_area`
  - `calc_cost_price`
  - `calc_quote_area`
  - `calc_quote_price`
  - `note`
- `calc_*` 字段用于保存换算过程，不只是临时工具

`materials`

- 当前前台叫 `供货商主材`
- 关键字段：
  - `id`
  - `sort_order`
  - `name`
  - `material_kind_id`
  - `primary_category`
  - `spec`
  - `unit`
  - `cost_unit_price`
  - `quote_unit_price`
  - `conversion_unit`
  - `conversion_quantity`
  - `calc_cost_area`
  - `calc_cost_price`
  - `calc_quote_area`
  - `calc_quote_price`
  - `brand`
  - `supplier`
  - `pricing_formula`
  - `note`
- 换算目标单位优先使用关联的抽象主材单位

### 报价案例

`customers`

- 历史遗留表，早期客户管理单独存在
- 当前产品语义中“客户与案例报价是一个整体”，但数据库仍可能保留客户表以兼容

`quotes`

- 案例报价
- 关键字段：
  - `id`
  - `customer_id`
  - `name`
  - `project_name`
  - `client_name`
  - `client_phone`
  - `client_address`
  - `quote_date`
  - `price_version_id`
  - `management_rate`
  - `design_rate`
  - `tax_rate`
  - `show_amount_columns`

`quote_project_groups`

- 当前前台叫 `项目组合`
- 关键字段：
  - `id`
  - `quote_id`
  - `name`
  - `type`
  - `work_type`
  - `icon_key`
  - `template_id`
  - `area`
  - `perimeter`
  - `height`
  - `building_area`
  - `collapsed`
  - `sort_order`
- 历史上有 `整体`、`空间`、`部分` 等概念，当前统一为项目组合

`quote_items`

- 报价明细行
- 关键字段：
  - `id`
  - `quote_id`
  - `project_group_id`
  - `sort_order`
  - `engineering_name`
  - `labor_item_name`
  - `item_type`
  - `material_kind_id`
  - `material_id`
  - `material_category`
  - `area`
  - `quantity`
  - `auxiliary`
  - `labor`
  - `legacy_unit_price`
  - `note`
- `item_type` 区分 `labor` / `material`
- `engineering_name` 是前台展示名，别名选择时可能不同于 `labor_item_name`

### 模板库

`project_group_templates`

- 项目组合模板
- 字段：`id`、`name`、`icon_key`、`sort_order`、`collapsed`、`library_order_applied`
- `library_order_applied` 用于新增时保持手动插入位置，重载后按库顺序归位

`project_group_template_items`

- 模板项目
- 字段包含 `item_type`、`item_name`、`material_kind_id`、`material_id`、`material_category`、`area`、`quantity`

### 套餐库

`packages`

- 套餐主表
- 字段包括 `name`、`unit`、`quote_unit_price`、`quantity_formula`、`description`、`exclusion_note`、`collapsed`

`package_sections`

- 套餐说明/项目组合区块
- 可折叠、可排序

`package_section_items`

- 套餐说明项目
- 可引用工费或主材
- 字段包括 `source_type`、`item_name`、`material_kind_id`、`material_id`、`area`

`package_estimates`

- 套餐成本测算
- 可多套测算
- 字段包括建筑面积、面积、周长、高度、报价单价、active、sortOrder

`package_estimate_groups`

- 套餐测算里的项目组合/分类实例
- 支持数量、面积、周长、高度

`package_estimate_items`

- 套餐测算项目
- 可关联套餐说明项目
- 支持 `included_type` 区分包含、差价、升级等后续模式

## 关键前台函数速查

这些函数名来自当前 `public/app.js`，以后接手时可优先搜索：

- `public/types.js`：前台核心 JSDoc 类型定义集中位置
- `server-types.js`：后端 SQLite/API JSDoc 类型定义集中位置
- `normalizeState`：统一修正应用状态
- `normalizeLaborItem`：工费条目标准化
- `normalizeMaterial`：供货商主材标准化
- `normalizeGenericMaterial`：抽象主材标准化
- `renderLaborLibrary`：渲染工费库
- `renderMaterials`：渲染主材库
- `renderGenericMaterialLibrary`：渲染抽象主材
- `renderSupplierMaterialLibrary`：渲染供货商主材
- `bindGenericMaterialCalculator`：抽象主材换算工具绑定
- `bindMaterialCalculator`：供货商主材换算工具绑定
- `renderLines`：渲染报价编辑明细
- `calculateQuoteItemUnitPrice`：报价行报价单价
- `calculateQuoteItemCostUnitPrice`：报价行成本单价
- `calculateTotals`：报价汇总
- `sortQuoteItemsForReload`：重载后按库顺序归位
- `compareLibraryOrderEntries`：库顺序排序核心比较函数
- `selectSuggestedItem`：选择工费建议项，支持别名显示但关联正主
- `confirmSimpleDelete`：页面内简单删除确认

## 最近重要变更记录

这些不是严格 commit log，而是帮助恢复“为什么现在代码长这样”的近期变更摘要：

1. 从 `pnpm` 改为 `npm`，`npm test` 覆盖所有主要测试和检查
2. 删除或弱化 JSON 主存储，SQLite 成为主数据源
3. 自动备份策略改为多时间层级保留
4. 报价编辑从“空间”逐步改为“项目组合”
5. 项目组合不再强制区分清工辅料/装修主材，可混合项目
6. 报价编辑支持显示金额开关，隐藏金额时表格仍要对齐
7. 模板库排序逻辑调整为与报价编辑一致
8. 新增项目不立即按库排序，刷新后再归位
9. 删除统一为页面内简单确认，避免原生 prompt/alert
10. 工费库增加别名功能，别名可搜索、可显示、底层仍关联正主
11. 工费族功能曾尝试，后来决定去掉
12. 通用主材改名为抽象主材
13. 主材库拆成抽象主材和供货商主材两个平级面板
14. 抽象主材和供货商主材都增加保存型换算工具
15. 主材换算工具成本和报价各保存一套计算过程
16. 供货商主材换算目标单位对齐关联抽象主材
17. 工费起步价功能已分析但未实现
18. 套餐报价模式已讨论，需要重新组织普通报价和套餐报价
19. 用户倾向尽快 TypeScript 化，但希望采用分阶段迁移，保持当前本地开发和测试效率
20. 用户决定先补一些 JSDoc，作为不立刻迁移 TypeScript 时的类型护栏

## 测试脚本速查

`package.json` 当前脚本：

```json
{
  "dev": "node server.js",
  "start": "node server.js",
  "test": "npm run test:unit && npm run check",
  "test:unit": "node --test scripts/frontend.test.js scripts/backend.test.js",
  "test:frontend": "node --test scripts/frontend.test.js",
  "test:backend": "node --test scripts/backend.test.js",
  "check": "node --check server.js && node -e \"new Function(require('fs').readFileSync('public/app.js','utf8')); console.log('app.js syntax ok')\" && node scripts/smoke-test.js"
}
```

每次改动以下内容，强烈建议运行 `npm test`：

- 数据库 schema 或迁移
- 保存/读取逻辑
- 报价金额计算
- 模板同步或排序
- 套餐测算
- 工费/主材选择和跳转
- 删除确认

纯 CSS 微调可以不每次补测试，但最好仍跑一次 `npm test` 确认脚本没有被误改。

## 重要注意事项

- 不要破坏用户已有 SQLite 数据
- 不要做 destructive git 操作
- 不要恢复旧 JSON 初始数据覆盖数据库
- 不要把新增条目马上自动排序到看不见的位置
- 不要用原生 alert/prompt 做正式交互
- 不要让输入框触发拖动排序
- 不要让大面积空白挤占报价编辑效率
- 修改字段或命名时，先以前台中文语义为准，再安全迁移代码变量和数据库字段

## 交接日志

后续每次出现重要业务规则、设计决策、功能实现、数据库迁移、测试策略变化，都应在本节追加记录。记录应短而准，方便新的 Codex 快速理解“最近发生了什么”。

### 2026-06-09 20:16

- 用户诉求：继续增强 `Codex.md`，并明确以后每次重要聊天内容都应在文档中留下痕迹，方便交接给新的 Codex。
- 处理结果：新增 `如何维护这份文档` 章节，明确维护原则、追加格式、哪些内容必须记录；新增 `交接日志` 章节，作为后续持续记录入口。
- 涉及文件：`Codex.md`
- 测试情况：仅文档修改，未运行 `npm test`。
- 后续注意：以后做功能或形成稳定决策时，应同步更新对应章节，并在本日志追加一条简短记录。

### 2026-06-09 20:20

- 用户诉求：探讨 JSDoc 与 TypeScript 的类型约束，并表达如果倾向尽快 TypeScript 化，希望开发过程仍然流畅。
- 处理结果：记录 TypeScript 迁移偏好：建议优先采用 Vite + TypeScript 管前台、`tsx` 管 Node 后台、`tsc --noEmit` 做类型检查，分阶段迁移核心逻辑和数据类型，避免一次性重写导致功能中断。
- 涉及文件：`Codex.md`
- 测试情况：仅文档修改，未运行 `npm test`。
- 后续注意：如果开始迁移，应先做低风险基础设施和类型定义，再迁移 normalize、计算、排序等纯函数，最后再拆 UI 渲染。

### 2026-06-09 20:24

- 用户诉求：如果暂不迁移 TypeScript，希望先补一些 JSDoc，降低数据结构越来越多带来的字段和类型错误风险。
- 处理结果：新增核心 typedef，包括 `LaborItem`、`MaterialKind`、`Material`、`ProjectGroup`、`QuoteItem`、`Quote`、`QuoteTotals`；给 normalize、报价计算、主材换算等关键函数补 `@param` 和 `@returns`；后端补 `PortableState`、`SqliteMaterial`、`SqliteMaterialKind` 以及 loader 返回类型。随后为减少主文件行数，将大块 typedef 抽到 `public/types.js` 和 `server-types.js`，主文件只保留轻量 `import()` 类型引用。
- 涉及文件：`public/types.js`、`server-types.js`、`public/app.js`、`server.js`、`Codex.md`
- 测试情况：已运行 `npm test`，39 个测试通过，`server.js` 和 `app.js` 语法检查通过，smoke test 通过。第一次运行时因本地服务未启动导致 smoke test 连接失败，启动服务后重跑通过。
- 后续注意：当前没有全文件开启 `// @ts-check`，这是为了避免历史代码一次性产生大量噪声；后续可以在拆出的纯逻辑文件里优先开启。

### 2026-06-10 17:08

- 用户诉求：检查前后台历史遗留函数，清理没有实际作用的前台旧逻辑。
- 处理结果：删除旧 Tauri 读写、旧本地文件绑定保存、旧内置示例数据、旧模板 select、旧 prompt 套模板、旧客户新增、旧整体空间包装、旧即时排序和无调用主材/百分比工具函数；补上工费版本删除按钮的实际绑定和 `deleteVersion()`，删除最后一个版本时阻止，删除被报价使用的版本时将报价切换到备用版本。
- 涉及文件：`public/app.js`、`Codex.md`
- 测试情况：已运行 `npm.cmd test`，39 个测试通过，`server.js` 和 `app.js` 语法检查通过，smoke test 通过。第一次运行时本地服务未启动导致 smoke test 连接失败，临时启动当前目录 Node 服务后重跑通过，随后已停止临时服务。
- 后续注意：后台函数暂未发现明确死代码；很多只被调用一次的函数属于数据库迁移、SQLite 读写或备份链路，不建议在没有迁移测试前删除。

### 2026-06-10 17:32

- 用户诉求：顶部操作区的“保存、导出数据、导入数据”看起来不再需要，希望确认用途并删除无用入口。
- 处理结果：移除顶部手动保存按钮、JSON 导出按钮、JSON 导入按钮和隐藏文件输入；删除对应的 JSON 导入导出函数。当前保存仍通过各处 `saveState()` 自动写入 SQLite，数据保护以“备份数据库”和自动 SQLite 备份为主。
- 涉及文件：`public/index.html`、`public/app.js`、`Codex.md`
- 测试情况：已运行 `npm.cmd test`，39 个测试通过，`server.js` 和 `app.js` 语法检查通过，smoke test 通过。
- 后续注意：如果以后需要跨机器迁移数据，优先考虑提供 SQLite 备份/恢复入口，而不是恢复旧 JSON 导入导出。

### 2026-06-10 17:54

- 用户诉求：抽象主材需要再加一层分类，仅用于主材库里管理抽象主材，暂时不影响其他页面。
- 处理结果：为抽象主材新增 `libraryCategory` / SQLite `material_kinds.library_category` 字段；抽象主材表新增“管理分类”列，并按该分类分段显示。该字段不写入报价行、模板项或套餐项，也不参与主材匹配逻辑。
- 涉及文件：`public/app.js`、`public/styles.css`、`server.js`、`public/types.js`、`server-types.js`、`scripts/frontend.test.js`、`scripts/backend.test.js`、`Codex.md`
- 测试情况：已运行 `npm.cmd test`，39 个测试通过，`server.js` 和 `app.js` 语法检查通过，smoke test 通过。
- 后续注意：如果以后希望这个分类影响其他页面，需要另行明确它和 `primaryCategory` 的关系；当前 `primaryCategory` 仍是报价/模板/套餐使用的主材匹配类目。

### 2026-06-10 18:12

- 用户诉求：抽象主材的管理分类也要支持收缩、唯一展开和排序，使用习惯对齐其他页面。
- 处理结果：抽象主材管理分类新增独立 UI 状态 `genericMaterialCategoryState`，保存每个分类的 `collapsed` 与 `sortOrder`；分类头可点击展开/收缩，展开某个分类时其他分类自动收缩，再点已展开分类可全部收起；分类头支持拖拽排序。抽象主材条目的拖拽排序限制在同一管理分类内，避免跨分类拖动造成显示顺序与分类归属冲突。
- 涉及文件：`public/app.js`、`public/styles.css`、`server.js`、`scripts/frontend.test.js`、`scripts/backend.test.js`、`Codex.md`
- 测试情况：已运行 `npm.cmd test`，40 个测试通过，`server.js` 和 `app.js` 语法检查通过，smoke test 通过。
- 后续注意：`genericMaterialCategoryState` 只影响主材库管理界面，不参与报价、模板、套餐或供货商主材匹配；业务匹配仍使用 `primaryCategory`。

### 2026-06-10 18:24

- 用户诉求：抽象主材管理分类不需要额外的“展开/收缩”文字按钮，左侧六点按钮同时承担拖动排序和展开/收缩。
- 处理结果：移除分类头的文字展开/收缩按钮；六点按钮单击切换分类展开状态，按住拖动调整分类顺序；分类名称区域不再触发展开/收缩，减少误触。
- 涉及文件：`public/app.js`、`public/styles.css`、`Codex.md`
- 测试情况：已运行 `npm.cmd test`，40 个测试通过，`server.js` 和 `app.js` 语法检查通过，smoke test 通过。
- 后续注意：六点按钮是该分类头唯一的操作入口；如果未来增加右键菜单或更多分类操作，应避免重新引入文字按钮造成拥挤。

### 2026-06-10 18:34

- 用户诉求：这个带箭头的六点按钮很好，希望所有相似功能的地方行为统一，并区分“可展开”与“仅排序”。
- 处理结果：新增通用样式 `expandable-drag-handle`，统一用于项目组合、模板、套餐说明分类、抽象主材管理分类这些同时支持展开/收缩和拖动排序的块；按钮展开时显示向下箭头，收起时显示向右箭头。普通工费/主材等仅排序行仍保留纯六点按钮，不显示箭头。移除项目组合、模板、套餐说明分类头部空白区域点击展开的行为，统一为只有六点按钮负责展开/收缩与移动。
- 涉及文件：`public/app.js`、`public/styles.css`、`Codex.md`
- 测试情况：已运行 `npm.cmd test`，40 个测试通过，`server.js` 和 `app.js` 语法检查通过，smoke test 通过。
- 后续注意：如果以后新增“既能折叠又能排序”的卡片/分组，应直接使用 `expandable-drag-handle`，不要使用普通 `price-drag` 或单独文字展开按钮。

### 2026-06-10 18:42

- 用户诉求：行间添加功能仍要使用细的悬浮按钮样式，避免插入区变得过高、过重。
- 处理结果：将项目组合之间的插入槽重新压回薄悬浮条样式；现有报价行、模板项、套餐说明项、套餐测算项、工费库行间插入继续保持细线 hover 出现的小按钮。
- 涉及文件：`public/styles.css`、`Codex.md`
- 测试情况：已运行 `npm.cmd test`，40 个测试通过，`server.js` 和 `app.js` 语法检查通过，smoke test 通过。
- 后续注意：行间添加和展开/排序是两类交互；行间添加应保持低高度、悬浮显现，不要套用 `expandable-drag-handle` 或做成常驻大按钮。

### 2026-06-10 18:50

- 用户诉求：确认抽象主材表是否真的有行间添加功能，截图显示该功能并未出现在抽象主材行之间。
- 处理结果：为抽象主材分类内新增行间插入槽，展开分类后在分类顶部和每个抽象主材条目后显示细悬浮添加入口；点击后按当前管理分类和指定位置插入新抽象主材。新增 `addGenericMaterialAt()`，并为该行为补前端测试。
- 涉及文件：`public/app.js`、`public/styles.css`、`scripts/frontend.test.js`、`Codex.md`
- 测试情况：已运行 `npm.cmd test`，41 个测试通过，`server.js` 和 `app.js` 语法检查通过，smoke test 通过。
- 后续注意：抽象主材行间添加只在展开的管理分类内出现，新增条目默认沿用该管理分类；分类收起时不显示插入槽。

### 2026-06-10 18:58

- 用户诉求：抽象主材换算里的“填成本”“填单价”不起作用，截图中结果仍为 `¥0.00`。
- 处理结果：修复主材换算器取值逻辑；当换算输入框为空但存在 placeholder（如 `0.32`、`18`、`22`）时，计算和填入按钮会使用 placeholder 作为默认换算依据。点击“填成本/填单价”时同步保存对应换算面积与价格字段。供货商主材和抽象主材换算器共用该修正。
- 涉及文件：`public/app.js`、`Codex.md`
- 测试情况：已运行 `npm.cmd test`，41 个测试通过，`server.js` 和 `app.js` 语法检查通过，smoke test 通过。
- 后续注意：换算器界面如果显示示例 placeholder，应确保按钮行为也按示例值计算，避免用户以为已经输入但实际算 0。

### 2026-06-10 19:04

- 用户诉求：抽象主材行间添加槽仍然太宽太高；需要几乎没有高度，鼠标悬浮在横格线上时出现按钮，按钮显示时可以覆盖上下内容。
- 处理结果：将抽象主材行间插入槽调整为 1px 高度，使用伪元素扩大 hover 感应区，按钮绝对层级浮在横线处，不再撑开上下行距。
- 涉及文件：`public/styles.css`、`Codex.md`
- 测试情况：已运行 `npm.cmd test`，41 个测试通过，`server.js` 和 `app.js` 语法检查通过，smoke test 通过。
- 后续注意：行间插入槽应优先采用 1px 线 + hover 感应区 + 浮层按钮；按钮可以压住上下内容，不应占据稳定布局高度。

### 2026-06-10 19:10

- 用户诉求：其他所有添加类入口都要按抽象主材的 1px 悬浮横线逻辑处理。
- 处理结果：将套餐说明项、套餐测算项、模板项、报价行、项目组合之间、工费库行、抽象主材行等行间添加入口统一为 1px 稳定高度；使用 `::before` 提供 hover 感应区，按钮/动作组浮在横线上方，不撑开上下内容；移除插入槽 hover 背景块。
- 涉及文件：`public/styles.css`、`Codex.md`
- 测试情况：已运行 `npm.cmd test`，41 个测试通过，`server.js` 和 `app.js` 语法检查通过，smoke test 通过。
- 后续注意：新增任何行间添加入口时，应使用 1px 线、hover 感应区和浮层按钮；不要使用固定 6px/18px 高度或常驻背景块。

### 2026-06-10 19:18

- 用户诉求：抽象主材点击“填成本”后界面显示已填，但重新打开仍为 0，怀疑没有保存到数据库。
- 处理结果：为关键填入按钮新增强保存路径 `saveStateNow()`，点击抽象主材/供货商主材的“填成本”“填单价”后立即构建最新状态并等待 `/api/data` 写入完成，再更新状态提示；避免普通异步自动保存尚未落库时刷新/关闭导致丢失。
- 涉及文件：`public/app.js`、`Codex.md`
- 测试情况：已运行 `npm.cmd test`，41 个测试通过，`server.js` 和 `app.js` 语法检查通过，smoke test 通过。
- 后续注意：涉及“按钮立即写入关键价格/成本”的操作，优先使用强保存；普通输入仍可使用排队式 `saveState()`。

### 2026-06-10 19:34

- 用户诉求：整包删除重写式保存设计不合理，希望改成“改哪里保存哪里”，并做好测试。
- 处理结果：第一阶段新增局部保存 API：`PATCH /api/material-kinds/:id`、`DELETE /api/material-kinds/:id`、`PATCH /api/materials/:id`、`DELETE /api/materials/:id`、`PATCH /api/app-state`。主材库相关编辑已改为局部保存：抽象主材、供货商主材的字段编辑、换算依据、填成本/填单价、新增、删除、排序，以及抽象主材分类展开/排序状态，不再通过 `/api/data` 整包重写。
- 涉及文件：`server.js`、`public/app.js`、`scripts/backend.test.js`、`scripts/frontend.test.js`、`Codex.md`
- 测试情况：已运行 `npm.cmd test`，42 个测试通过，新增后端测试验证 PATCH 主材/抽象主材不会重写报价、模板等其它表，`server.js` 和 `app.js` 语法检查通过，smoke test 通过。
- 后续注意：当前整包保存仍保留给未迁移模块和备份/迁移用途；下一阶段应继续把工费库、报价行、模板、套餐逐步迁到局部 API。
### 2026-06-10 19:52

- 用户诉求：继续把保存逻辑拆细，最好做到每个格子单独保存，避免任何普通编辑触发整包重写。
- 处理结果：第二阶段新增并接入局部保存 API：`PATCH/DELETE /api/labor-items/:id`、`PATCH/DELETE /api/quote-items/:id`、`PATCH/DELETE /api/quotes/:id`、`PATCH/DELETE /api/project-groups/:id`。工费库字段、工费别名、工费排序、工费删除后的报价行解绑、工费名称/单位/价格联动报价行、报价行字段、新增/删除/移动报价行、报价头字段、项目组合名称/图标/面积/周长/高度/折叠/排序/新增/删除/同步模板，均改为对应实体局部保存。项目组合面积/周长/高度变化会同步保存受推荐工程量影响的报价行。
- 涉及文件：`server.js`、`public/app.js`、`scripts/backend.test.js`、`Codex.md`。
- 测试情况：已运行 `npm.cmd test`，44 个测试通过，`server.js` 和 `app.js` 语法检查通过，smoke test 通过。新增后端测试覆盖主材局部保存、工费/报价行局部保存、报价头/项目组合局部保存，并验证不会重写无关表行。
- 后续注意：整包 `/api/data` 仍作为未迁移模块、初始化、备份/迁移兜底保留；模板库、套餐库、客户/工费版本等仍有若干 `saveState()`，下一阶段可继续按实体拆 `template`、`template-item`、`package`、`package-section`、`package-estimate`、`customer`、`price-version` 等局部 API。

### 2026-06-10 22:20

- 用户诉求：抽象主材主行的“基准成本 / 基准单价”仍不保存；控制台显示 `Partial save failed Error: HTTP 404`，页面顶部提示“保存失败，请确认 Node 服务正在运行”。
- 处理结果：先确认前端请求的是 `/api/material-kinds/:id`，而当前 `server.js` 已经包含该 PATCH 路由；随后用 `Invoke-WebRequest -Method Patch http://127.0.0.1:5177/api/material-kinds/test` 复现 404，说明浏览器连接的 5177 服务不是当前最新代码。通过 `netstat -ano | Select-String ':5177'` 找到占用端口的旧 `node.exe` 进程，执行 `Stop-Process -Id 16168` 停止旧服务，再从当前项目目录启动 `node server.js`，新进程为 `20780`。重新请求 `/api/material-kinds/codex-route-test` 返回 200，随后删除测试抽象主材。
- 涉及文件：`public/app.js`、`server.js`、`scripts/frontend.test.js`、`Codex.md`
- 测试情况：在修复保存时序后已运行 `npm.cmd test`，49 个测试通过，`server.js` 和 `app.js` 语法检查通过，smoke test 通过；本条为运行环境排查记录，追加文档时未重复跑测试。
- 后续注意：如果页面提示保存失败且浏览器控制台出现 `Partial save failed Error: HTTP 404`，不要先怀疑字段名或 SQLite 写入逻辑；应优先确认当前端口跑的是最新项目服务。推荐排查顺序：1. 看控制台失败 URL；2. 用 `Invoke-WebRequest` 直接打同一 API；3. 用 `netstat -ano | Select-String ':5177'` 查端口占用；4. 停掉旧 Node 进程；5. 在当前工作目录重启 `node server.js` 或 `npm run dev`；6. 再用临时测试 id 验证 PATCH 返回 200，并删除测试数据。
