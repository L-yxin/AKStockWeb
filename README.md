# AKStock 量化信号分析平台 —— 前端

基于 Vue 3 + Vite + klinecharts v10 的 A 股量化信号可视化平台。
弥补通用量化软件在自定义指标叠加、多空信号展示、模拟交易、云指标等可视化功能上的不足。

后端对接通达信 tqcenter 行情数据 + akquant 回测引擎，详见 `../TDXQuant/webapi/api_docs.md`。

---

## 技术栈

| 类别 | 技术 | 版本 |
|---|---|---|
| 框架 | Vue 3 (`<script setup>`) | ^3.5.32 |
| 构建 | Vite | ^8.0.4 |
| 路由 | Vue Router | ^4.6.4 |
| 状态管理 | Pinia | ^3.0.4 |
| UI 组件 | Element Plus（深色模式） | ^2.13.6 |
| K线图表 | klinecharts | ^10.0.0-beta1 |
| 指标计算 | technicalindicators | ^3.1.0 |
| 云指标图表 | ECharts | ^6.0.0 |
| 自动导入 | unplugin-auto-import + unplugin-vue-components | — |

---

## 快速开始

```bash
# 安装依赖
npm install

# 开发模式（http://localhost:5173）
npm run dev

# 生产构建
npm run build

# 预览构建产物
npm run preview
```

**前置条件**：后端需先启动（`uvicorn webapi.main:app --host 127.0.0.1 --port 8000`），
前端通过 WebSocket `ws://localhost:8000/ws/*` 和 REST `http://localhost:8000/api/*` 对接。

---

## URL 参数（分享/深链）

支持通过地址栏 URL 参数一键设置平台状态，页面加载时自动应用，无需手动操作。

| 参数 | 别名 | 说明 | 示例 |
|---|---|---|---|
| `code` | `symbol` | 标的代码 | `code=sh600000` |
| `adjust` | `adjust_type` | 复权：`none`/`front`/`back` | `adjust=front` |
| `start` | `startDate` | 起始时间（`YYYY-MM-DD` 或 `YYYY-MM-DD HH:mm:ss`） | `start=2024-01-01` |
| `end` | `endDate` | 结束时间（同上） | `end=2026-09-06` |
| `indicators` | — | K线技术指标，多个用 `\|` 分隔，格式 `名称:参数`；参数只能是**数字 + 英文逗号**；只写名称不带参数时使用默认参数 | `indicators=MA:5,10,20,60\|VOL:5,10,20\|RSI:14` |
| `ls` | — | 买卖提示指标，多个用 `\|` 分隔；名称按 method 或 info 匹配后台目录；参数**校验后才提交**。两种写法：**位置式** `名称:数字,数字`（按序填 int/float）；**命名式** `名称:参数名=值;参数名=值`（复合 Config 类型直接传值，见下） | `ls=is_volume_price_sync:5,8\|均线金叉:ma_pairs=5,10,10,20` |
| `trades` | — | `1`/`true` → 加载 pybroker 订单 | `trades=1` |
| `cloud` | — | `1`/`true` → 仅刷新云指标（列表 + K线叠加缓存），不打开面板 | `cloud=1` |

**复合 Config 类型（命名式写法）**：后端 pydantic Config 类均支持字符串/列表输入，URL 上直接传值：

| Config 参数 | 后端类型 | URL 传值 | 示例 |
|---|---|---|---|
| `macdconfig` | `MacdConfig`（3 整数） | `fast,slow,signal` | `macdconfig=12,16,8` |
| `ma_periods` | `MaPeriodsConfig`（整数列表） | 逗号分隔整数 | `ma_periods=5,10,20,30` |
| `rsi_periods` | `RsiConfig`（整数列表） | 逗号分隔整数 | `rsi_periods=6,12,24,48` |
| `ma_pairs` | `MaPairsConfig`（二元组列表） | **扁平数字两两成对** `s1,l1,s2,l2` | `ma_pairs=5,10,10,20` |

注意：`ma_pairs` 刻意用扁平数字两两成对（`5,10,10,20` → `[[5,10],[10,20]]`），避开 `;` 分隔符与指标段分隔冲突；`;` 用于**同一指标内多个命名参数**的分隔，`\|` 用于**多个指标**的分隔。

**完整示例**：

```
http://localhost:5173/?code=sh600000&adjust=front&start=2024-01-01&end=2026-09-06&indicators=MA:5,10,20,60|VOL:5,10,20|RSI:14&ls=MACD金叉:macdconfig=12,16,8;onTheZeroAxis=1|均线向上:ma_periods=5,10,20,30;threshold=0.05|RSI超卖:rsi_periods=6,12,24,48;threshold=25&trades=1&cloud=1
```

**校验规则**：
- `indicators`：参数格式不符（非数字/非英文逗号）的指标跳过并告警；无参数时用 `indicatorDefaults.DEFAULT_PARAMS` 默认值
- `ls`（买卖提示）：指标名在后台目录中不存在 → 跳过；参数校验不合格（格式不符/值非法）→ 跳过并弹窗告警，并显示不合格原因（如 `参数macdconfig=12,16不合格`）；通过校验的指标按 URL 参数 + 目录默认值提交 `/ws/getLongShortSignal`，信号标记到 K线并存入 `searchStore.longShortSignals`
  - **位置式**：仅 int/float 类型参数接收 URL 数字，`*Config` 复杂类型与 bool 参数保持默认值；数字个数超过该指标可接收数量 → 跳过
  - **命名式**：按参数名匹配目录 `params` 注解（annotation）逐项校验转换——`MacdConfig`（恰 3 整数）、`MaPeriodsConfig`/`RsiConfig`（逗号整数列表）、`MaPairsConfig`（偶数个扁平整数）、int/float/bool 严格正则；其他 `*Config` 类型仅允许 `[\d.,;]` 原样透传；**先全填默认值，再覆盖命名参数**，避免遗漏参数
- 时间参数自动统一为 `YYYY-MM-DD HH:mm:ss` 写入 store；**URL 未提供 start/end 时，store 默认 ISO 值（toISOString）同样被规范化为该格式**（K线分页 `addDays` 只认 `YYYY-MM-DD HH:mm:ss`，否则 K线空白）；提交多空信号时自动转 ISO（后端 `/ws/getLongShortSignal` 要求 `%Y-%m-%dT%H:%M:%S.%fZ`）
- URL 无任何参数时不做任何动作；搜索类参数（code/adjust/start/end/indicators）变化自动触发一次数据加载（延迟 500ms，避开页面加载早期组件初始化竞态）

实现：`src/urlParams.js`（`applyUrlParams`，由 `home.vue` 挂载时调用）。

---

## 项目结构

```
akstock/
├── index.html
├── package.json
├── vite.config.js
├── README.md                  # 本文档
├── docs/
│   └── backend-api.md         # 后端 API 参考（旧版，以 webapi/api_docs.md 为准）
└── src/
    ├── main.js                # 应用入口（注册 Pinia/Router/ElementPlus/深色模式）
    ├── App.vue                # 根组件（挂载 home）
    ├── style.css              # 全局样式（深色主题变量）
    ├── api/
    │   └── index.js           # 后端 API 地址常量 + WebSocket/REST 封装
    ├── router/
    │   └── index.js           # 路由（单页 / → kLineView）
    ├── stores/                # Pinia 状态管理
    │   ├── searchParameters.js    # 搜索参数（标的/日期/复权/周期/已启用指标/多空信号）
    │   ├── simulationStore.js      # 模拟交易状态机（逐根跳柱/持仓/盈亏/成交记录）
    │   ├── cloudMetricStore.js     # 云指标列表状态
    │   └── setting.js              # 设置（预留）
    ├── config/
    │   └── indicatorDefaults.js   # 指标默认参数 + 默认启用列表
    ├── chart/
    │   ├── indicators/         # 自定义 klinecharts 指标（副作用模块，引入即注册）
    │   │   ├── index.js            # 注册入口（批量 import）
    │   │   ├── rsi.js              # RSI 补丁版（technicalindicators 替代内置 bug 实现）+ 速度加速度
    │   │   ├── highLowPoints.js    # 相对高低点（HL / RelativeHighPoints / RelativeLowPoints）
    │   │   ├── volumeNewLowDays.js # 成交量距上次更低量天数
    │   │   ├── continuousChange.js # 阶梯线连续涨跌计数
    │   │   └── cloudMetrics.js     # 云指标（REST 拉取已上传多列 DataFrame，K线叠加）
    │   ├── markers.js           # 交易信号标记（addMarkers / clearAllMarkers / mesMap）
    │   └── overlays.js          # 自定义覆盖图（simpleAnnotation2 买卖注解 / textTip 文字标注）
    ├── components/
    │   ├── home.vue             # 主布局（顶栏/菜单栏/K线区/模拟交易侧栏/功能抽屉）
    │   └── panels/              # 功能面板（抽屉或侧栏挂载）
    │       ├── IndicatorPanel.vue        # K线技术指标管理（启用/主图/参数编辑）
    │       ├── LongShortIndicatorPanel.vue # 买卖提示指标（后端指标目录 + 参数配置 + 多空信号生成）
    │       ├── SignalQualityPanel.vue     # 信号质量评测（手动/图表导入信号 → akquant 报告）
    │       ├── SimulationPanel.vue        # 模拟交易（初始化/逐根交易/成交记录/绩效报告）
    │       └── CloudMetricPanel.vue       # 云指标查看（已上传列表 + ECharts 多折线）
    └── views/
        ├── kLineView.vue         # K线主组件（图表初始化/分页加载/十字光标/模拟遮挡/拖拽接管）
        └── SelectionDeviceView.vue # 顶栏选择器（标的搜索/日期范围/复权/加载按钮）
```

---

## 核心功能

### 1. K线图（`views/kLineView.vue`）

- **图表引擎**：klinecharts v10 beta1，深色主题，A股红涨绿跌配色
- **分页加载**：`setDataLoader` 实现 init/forward 分页，每次请求最近 300 根，
  按周期换算自然日窗口，触达用户设定起点后停止翻页
- **实时轮询**：`subscribeBar` 每 5 秒拉取最新 K线（仅交易时段）
- **周期切换**：1分/5分/15分/30分/60分/日K/周K/月K，调用 `chart.setPeriod({type, span})`
- **自定义 Tooltip**：关闭内置 tooltip，用 `onCrosshairChange` + `convertFromPixel` 实现
  增强版悬浮提示（开高低收量涨幅 + 交易信号消息）
- **十字光标时间精确到秒**：`setFormatter` 在 crosshair 类型时把 `HH:mm` 模板补齐为 `HH:mm:ss`
- **指标重放**：K线对象重建（切换标的/周期）后，按 `searchStore.enabledIndicators`
  重新创建已启用指标，修复"指标未在K线对象变更后重新启用"

### 2. 技术指标（`chart/indicators/`）

**内置指标**（klinecharts 自带）：MA / EMA / MACD / KDJ / RSI / BOLL / VOL 等，
通过 `getSupportedIndicators()` 动态列出，参数可在面板中编辑。

**自定义指标**（`registerIndicator` 注册，引入即生效）：

| 指标名 | shortName | 说明 |
|---|---|---|
| `RSI` | RSI | **补丁版**：klinecharts 内置 RSI 计算有 bug，改用 `technicalindicators.RSI.calculate`；动态生成多周期 figure |
| `RSISpeedWithAcc` | — | RSI 速度（一阶差分）与加速度（二阶差分） |
| `Relative high and low points` | HL | 基于 EMA 拐点识别的相对高低点阶梯线，参数 `[period, step]` |
| `RelativeHighPoints` | — | 仅高点阶梯线，支持多组参数 |
| `RelativeLowPoints` | — | 仅低点阶梯线，支持多组参数 |
| `VolumeNewLowDays` | VolNLD | 统计当前成交量距上一次更低成交量的天数，参数 `[max_lookback]` |
| `ContinuousChange` | — | 阶梯线连续上升/下降计数，支持回看窗口限制 |
| `cloudMetrics` | CloudMetrics | 云指标（REST 拉取已上传多列 DataFrame，K线叠加，`calcParams[0]` = 指标名称） |

**指标管理面板**（`IndicatorPanel.vue`）：
- 动态列出 klinecharts 支持的全部指标
- 勾选启用/禁用，选择是否叠加在主图
- 点击编辑按钮修改 `calcParams`（逗号分隔多参数）
- 启用状态持久化到 `searchStore.enabledIndicators`

### 3. 买卖提示指标（`LongShortIndicatorPanel.vue`）

- 从后端 `WS /ws/buyingAndSellingIndicator` 拉取通达信 KLineForm 指标目录
  （买入指标 / 卖出指标，含方法名、说明、参数定义、文档）
- 勾选启用指标，动态渲染参数输入框（按注解类型自动选择输入组件）
- 点击"启用选择的多空指标"后，向后端 `WS /ws/getLongShortSignal` 提交
  `{symbol, period, adjust_type, startTime, endTime, indicators}`，
  后端 Signaltest 引擎生成多空信号
- 信号存储到 `searchStore.longShortSignals`，供模拟交易"下一信号跳转"和当前柱信号提示使用

### 4. 信号质量评测（`SignalQualityPanel.vue`）

- 手动添加信号（方向/时间/价格/备注），或从图表导入已加载的交易标记
- 提交到后端 `WS /ws/signalQualityEvaluate`，后端 akquant 自动配对开平仓
  （long→开多/平空，short→开空/平多，支持多空双向），回放行情生成评价报告
- 报告文件名带时间戳：`report_<symbol>_<YYYYMMDD_HHMMSS>.html`，
  返回 `file:///` URL，前端可直接点击在浏览器打开
- 展示摘要指标：初始资金/最终权益/总收益率/最大回撤/交易次数/胜率/总盈亏

### 5. 模拟交易（`SimulationPanel.vue` + `simulationStore.js`）

**初始化配置**：
- 起始/结束时间（默认当前标的图表起止时间）
- 标的：仅当前，只读展示
- 交易方向：单向做多 / 单向做空 / 双向交易
- 保证金：按金额（元/手）或按百分比（开仓价×乘数×手数×%）
- 合约乘数：默认 100（手→股）
- 交易制度：T+1（默认）/ T+0

**交易操作**：
- 当前交易时间按 K线柱逐根推进（上一根/下一根/自动播放/下一信号跳转）
- 交易价格：开盘/收盘/最高/最低 4 按钮 + 用户自定义输入（范围在高低之间），默认收盘
- 数量：默认 1 手
- 交易按钮：买（开）/ 卖（开）/ 多平 / 空平（按交易方向动态启用/禁用）
- T+1 规则：当日开仓不能当日平仓，前端拦截
- 保证金检查：可用资金不足时拦截

**可视化**：
- 交易记录以 `simpleAnnotation2` 覆盖图标记到 K线上（多开/空开/多平/空平不同颜色）
- 未来 K线遮挡：启用模拟交易时，DOM 层 `.sim-future-mask` 从当前柱右边缘
  覆盖到容器右端（`rgba(8,12,24,0.96)`），全程本地数据无网络请求
- 拖拽接管：用户拖动 K线图时（pointerdown→pointerup 位移>8px），
  当前模拟柱跟随视区最右可见柱；点击/程序滚动不触发
- 视区跟随：跳柱后 `scrollToDataIndex` 让当前柱滚到视区右端
- 下一信号跳转：`nextSignal` computed 从 `searchStore.longShortSignals` 匹配
  当前柱之后的信号时间，点击直接跳到该柱

**结束模拟**：
- 临时退出（暂停）/ 结束模拟交易
- 结束时清除 K线上的买卖标记，提交全部成交记录到后端
  `WS /ws/simulationEvaluate`，akquant 逐笔回放生成绩效报告
  （`sim_report_<symbol>_<时间戳>.html`），返回 `file:///` URL + 摘要指标
- 交易记录列表保留在面板底部展示

### 6. 云指标（`CloudMetricPanel.vue` + `cloudMetrics.js`）

**设计理念**：云指标针对全市场、与个股数据无关，无法用个股 K线计算。
由 Python 端计算后调用 `postCloudMetrics(df, name)` 上传到服务器存储，
前端只读展示。

**两种展示方式**：

1. **独立面板多折线图**（`CloudMetricPanel.vue`）：
   - 列出已上传的云指标（名称/行数/列数/时间范围/更新时间）
   - 点击查看，ECharts 渲染多折线图，每列不同颜色，legend 含列名
   - 支持删除

2. **K线叠加**（`chart/indicators/cloudMetrics.js`）：
   - 注册为 klinecharts 指标 `cloudMetrics`，可在技术指标面板中启用
   - `calcParams[0]` = 云指标名称（默认 `'cloudMetrics'`），修改参数即可切换指标
   - 从后端 `GET /api/cloudMetrics/get?name&start&end` 拉取多列 DataFrame
   - 数据到达后动态更新 figures（每列一条线，固定 12 色调色板），
     `overrideIndicator` 强制重算
   - 按时间戳对齐到 K线数据，找不到的柱返回 null
   - 60 秒定时轮询刷新

### 7. pybroker 订单加载（`home.vue`）

- 点击"加载pybroker订单"，向后端 `WS /ws/getTradingSignals` 发送
  `{symbol, startTime, endTime, adjust_type}`
- 后端从全局缓存（由 `POST /api/trades_csv` 上传的交易记录）按标的过滤，
  转为 `configs` 列表（`{datetime, value, type: B/S, mes}`）
- 前端清除旧标记后，用 `addMarkers` 批量添加到 K线图

---

## 状态管理（Pinia）

### `searchParameters`（搜索参数 + 全局共享）

| 状态 | 说明 |
|---|---|
| `symbol` | 当前标的（默认 `sh000001` 上证指数） |
| `startDate` / `endDate` | 日期范围（默认 6 年前 ~ 今天） |
| `adjust_type` | 复权类型：`none` / `front` / `back` |
| `period` | K线周期 `{type, span}`，type ∈ minute/hour/day/week/month |
| `enabledIndicators` | 已启用技术指标 `[{name, calcParams, onMainChart}]` |
| `longShortSignals` | 多空信号列表（买卖提示指标生成，供模拟交易使用） |
| `onLoadEvent` | 加载事件 Map，点击"加载数据"时依次执行 |
| `validateParameters()` | 参数校验（标的非空/日期合法/结束≥开始/复权合法） |
| `onLoad()` | 校验通过后执行所有加载事件 |

### `simulation`（模拟交易状态机）

核心状态：`config`（初始化配置）、`active`/`paused`/`finished`、`bars`（模拟区间K线）、
`cursorIndex`、`trades`（成交记录）、`positions`（多空持仓）、`initialCash`/`usedMargin`/
`realizedPnl`、`report`（绩效报告）、`chartKey`（标的:周期校验）。

核心方法：`startSimulation` / `pause` / `resume` / `finish` / `reset` /
`nextBar` / `prevBar` / `setCursorFromChart` / `jumpToSignal` /
`openPosition` / `closePosition` / `getMarkerConfigs`。

计算属性：`currentBar` / `availableCash` / `totalEquity` / `currentSignals` /
`unrealizedPnl` / `nextSignal`。

---

## API 对接

### 地址常量（`src/api/index.js`）

```js
base_ws_url   = "ws://localhost:8000/ws"
base_http_url = "http://localhost:8000"
```

### WebSocket 端点

| 端点 | 用途 | 调用方 |
|---|---|---|
| `/ws/kline` | 历史 K线（支持分页 limit） | kLineView |
| `/ws/allSymbols` | 全部标的（支持 query 过滤） | SelectionDeviceView |
| `/ws/buyingAndSellingIndicator` | 买卖指标目录 | LongShortIndicatorPanel |
| `/ws/getLongShortSignal` | 多空信号（Signaltest 引擎） | LongShortIndicatorPanel |
| `/ws/getTradingSignals` | 交易记录标记（pybroker 订单） | home.vue |
| `/ws/cloudMetrics` | 云指标（市场情绪，Sanguine.ipynb） | 预留（当前前端用 REST） |
| `/ws/signalQualityEvaluate` | 信号质量评测（akquant 报告） | SignalQualityPanel |
| `/ws/simulationEvaluate` | 模拟交易绩效评估（akquant 报告） | SimulationPanel |

### REST 端点

| 方法 | 路径 | 用途 |
|---|---|---|
| POST | `/api/cloudMetrics/upload` | 上传云指标 DataFrame（前端已不用，Python 端用 postCloudMetrics） |
| GET | `/api/cloudMetrics/list` | 列出已上传云指标 |
| GET | `/api/cloudMetrics/get` | 按起止时间查询云指标（多列时间序列） |
| DELETE | `/api/cloudMetrics/delete` | 删除云指标 |
| POST | `/api/trades_csv` | 上传交易记录 CSV（pybroker 订单） |
| GET | `/api/health` | 健康检查 |

REST 封装函数：`uploadCloudMetric` / `listCloudMetrics` / `getCloudMetric` / `deleteCloudMetric`。

---

## 关键技术细节

### 时区约定

- 后端：通达信本地时间（无时区）→ 显式按 `Asia/Shanghai` 解释 → 转 epoch 毫秒
- 前端：显示 `Asia/Shanghai` 时刻 = `epoch + 8h` 后的 UTC 字段，不依赖浏览器本地时区
- 模拟交易：`parseDateTs` / `barDate` / `formatDateTime` 均显式 `+08:00`

### klinecharts v10 关键 API

> 所有 API 均从 https://klinecharts.com 或本地 `node_modules/klinecharts/dist/index.d.ts` 核实。

| API | 用途 |
|---|---|
| `init(id, {locale, timezone})` | 初始化图表 |
| `setStyles(styles)` | 设置深色主题样式 |
| `setSymbol({ticker})` | 设置标的 |
| `setPeriod({type, span})` | 设置周期（minute/hour/day/week/month） |
| `setDataLoader({getBars, subscribeBar, unsubscribeBar})` | 分页数据加载器 |
| `getDataList()` | 获取全量 K线数据 |
| `getVisibleRange()` | 获取可见范围 `{from, to, realFrom, realTo}` |
| `scrollToDataIndex(idx, animationDuration)` | 滚动到指定数据索引（目标到视区右端） |
| `getBarSpace()` | 获取柱间距 `{bar, halfBar, gapBar, halfGapBar}` |
| `getDom(paneId)` | 获取 pane DOM（`candle_pane`） |
| `getPeriod()` | 获取当前周期 |
| `createIndicator({name, calcParams}, onMainChart, {id})` | 创建指标 |
| `overrideIndicator({name, calc, figures})` | 覆盖指标配置（calc 引用变化触发重算） |
| `createOverlay({name, points, extendData})` | 创建覆盖图 |
| `removeOverlay()` | 移除全部覆盖图 |
| `subscribeAction('onCrosshairChange'|'onVisibleRangeChange', cb)` | 订阅动作 |
| `convertFromPixel({x, y})` | 像素→数据坐标 |
| `setFormatter({formatDate})` | 设置日期格式化（crosshair 精确到秒） |
| `resize()` | 重排图表 |
| `registerIndicator(template)` | 注册自定义指标（包导出） |
| `registerOverlay(config)` | 注册自定义覆盖图（包导出） |
| `getSupportedIndicators()` | 获取内置支持的指标列表 |

**已知限制**：
- 无 `setDataList`（数据不可覆盖）
- 覆盖图坐标转换只认 `point.timestamp`，不认 `point.dataIndex`
- `convertToPixel` 的 x 返回数据坐标，`absolute:true` 只作用于 y

### 模拟交易未来 K线遮挡方案

放弃 klinecharts overlay 方案（在此实例 overlay 通用渲染层不显示），
改用 DOM 绝对定位层：
- `chart-wrap` 内 `<div class="sim-future-mask">`，z-index 9，pointer-events:none
- 位置计算：`barIndexOf(chart, ts)` 在 `getDataList()` 中线性查找当前柱数据索引
  → `(barIdx - floor(realFrom)) * barSpace.bar + halfGapBar + paneDom.offsetLeft`
- 随 `onVisibleRangeChange` / `cursorIndex` / `bars.length` 实时更新
- 模拟结束时 `display:none`，并清除 K线上的买卖标记

---

## 开发约定

- **klinecharts API**：必须从 https://klinecharts.com 或本地 `node_modules/klinecharts/dist/`
  核实，禁止凭记忆套用（该库较新，AI 容易出错）
- **功能代码**：指标算法等核心逻辑不可大幅改动（如 RSI 补丁），UI 层可全面改写
- **文件拆分**：单个文件功能过多时拆分为更多文件
- **时区**：所有时间处理显式按 `Asia/Shanghai`，不依赖系统/浏览器时区
- **后端对接**：前端只负责提交和展示，量化计算/回测/报告生成由后端 akquant 完成
