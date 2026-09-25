# AKStock 前端 ↔ Python 后台 WebSocket API 文档

> 版本：v1.1（2026-09-05）
> 适用范围：AKStockWeb 前端（Vue3 + klinecharts）与 Python 后台（akquant）之间的全部通信契约。
> 数据源说明：后台行情数据统一对接
>
> **通达信（tqcenter）**
>
> ，不再依赖互联网同步通道（前端已移除该功能）。



***

## 1. 连接约定



| 项目  | 约定                                  |
| --- | ----------------------------------- |
| 协议  | WebSocket（文本帧，UTF-8 JSON）           |
| 基址  | `ws://localhost:8000/ws`            |
| 请求体 | JSON 字符串（`action` 字段区分端点）           |
| 响应体 | JSON 字符串                            |
| 时间戳 | K 线数据统一为 **毫秒**（v10 klinecharts 约定） |
| 日期  | 字符串 `YYYY-MM-DD`                    |
| 时间  | 字符串 `YYYY-MM-DD HH:mm:ss`（或仅日期）     |

### 通用响应字段

所有端点响应统一使用以下外壳（signalQualityEvaluate 见第 6 节专项定义）：



```
{

&#x20; "code": 0,

&#x20; "message": "ok",

&#x20; "data": { }

}
```



* `code`：`0` 成功；非 0 失败（各端点错误码见下）。

* `message`：人类可读描述。

* `data`：业务数据（结构因端点而异）。

* 部分旧端点直接返回裸数据（如 `allSymbols` 返回数组），为兼容历史保持不回包。



***

## 2. 端点总览



| action / 端点                        | 方法 | 用途              | 前端文件                                                |
| ---------------------------------- | -- | --------------- | --------------------------------------------------- |
| `ws://…/kline`                     | —  | K 线历史 / 增量数据    | `src/views/kLineView.vue`                           |
| `ws://…/allSymbols`                | —  | 标的列表搜索          | `src/views/SelectionDeviceView.vue`                 |
| `ws://…/buyingAndSellingIndicator` | —  | 买卖提示指标目录        | `src/components/panels/LongShortIndicatorPanel.vue` |
| `ws://…/getLongShortSignal`        | —  | 生成多空信号          | `src/components/panels/LongShortIndicatorPanel.vue` |
| `ws://…/getTradingSignals`         | —  | pybroker 交易订单信号 | `src/components/home.vue`                           |
| `ws://…/cloudMetrics`              | —  | 云指标数据           | `src/chart/indicators/cloudMetrics.js`              |
| `ws://…/signalQualityEvaluate`     | —  | **信号质量评测（新增）**  | `src/components/panels/SignalQualityPanel.vue`      |
| `GET /api/pyInd/list`               | REST | Python 指标清单 + talib 函数 | `src/components/panels/PythonIndicatorPanel.vue`    |
| `GET /api/pyInd/{name}.js`          | REST | 计算 Python 指标（`data` 复合序列） | `src/chart/indicators/pyInd.js`                |



***

## 3. K 线数据 `ws://…/kline`

### 3.1 请求（前端 → 后台）



```
{

&#x20; "action": "history",

&#x20; "code": "sh600000",

&#x20; "period": "1d",

&#x20; "adjust\_type": "none",

&#x20; "start\_date": "2020-09-01",

&#x20; "end\_date": "2026-09-05"

}
```



| 字段            | 类型     | 说明                                            |
| ------------- | ------ | --------------------------------------------- |
| `action`      | string | 固定 `"history"`                                |
| `code`        | string | 标的代码（前端统一小写前缀：`sh`/`sz`/`bj`）                 |
| `period`      | string | 周期，格式 `${span}${type}`，如 `1d`、`5m`、`60m`、`1w` |
| `adjust_type` | string | 复权：`none` 不复权 / `front` 前复权 / `back` 后复权      |
| `start_date`  | string | 起始日期 `YYYY-MM-DD`                             |
| `end_date`    | string | 结束日期 `YYYY-MM-DD`                             |
| `limit`       | number | 可选。非空时后端只返回该区间内时间最近的 N 根（升序），用于前端分页加载；缺省返回区间内全部 |

### 3.2 响应（后台 → 前端）



```
{

&#x20; "code": 0,

&#x20; "data": \[

&#x20;   { "timestamp": 1598918400000, "open": 10.1, "high": 10.5, "low": 10.0, "close": 10.4, "volume": 123456 },

&#x20;   { "timestamp": 1599004800000, "open": 10.4, "high": 10.6, "low": 10.2, "close": 10.3, "volume": 98765 }

&#x20; ]

}
```

> 时间戳必须为
>
> **毫秒**
>
> ，且按时间升序排列；K 线对象字段名严格为 
>
> `timestamp/open/high/low/close/volume`
>
> 。



***

## 4. 标的列表 `ws://…/allSymbols`

### 4.1 请求



```
{ "action": "allSymbols", "query": "600000" }
```



| 字段       | 类型     | 说明                     |
| -------- | ------ | ---------------------- |
| `action` | string | 固定 `"allSymbols"`      |
| `query`  | string | 搜索关键词（代码或名称，可为空串 = 全量） |

### 4.2 响应（数组）



```
{ "code": 0, "data": \[ { "code": "sh600000", "name": "浦发银行" } ] }
```

> 前端下拉展示 
>
> `code name`
>
> ；
>
> `code`
>
>  需与 K 线端点 
>
> `code`
>
>  字段同格式。



***

## 5. 多空信号链路

### 5.1 指标目录 `ws://…/buyingAndSellingIndicator`

请求：空消息或 `""`。

响应（`data.buy` / `data.sell` 内部为 JSON **字符串**，需二次解析）：



```
{

&#x20; "code": 0,

&#x20; "data": {

&#x20;   "buy": "{\\"method\\":{\\"0\\":\\"rsi\_buy\\"},\\"info\\":{\\"0\\":\\"RSI超卖金叉\\"},\\"type\\":{\\"0\\":\\"buy\\"},\\"enabled\\":{\\"0\\":false},\\"params\\":{\\"0\\":{\\"params\\":\[{\\"name\\":\\"period\\",\\"annotation\\":\\"\<class 'int'>\\",\\"default\\":14,\\"required\\":true}],\\"doc\\":\\"RSI 低于 30 后金叉\\"}}}",

&#x20;   "sell": "…同结构…"

&#x20; }

}
```

`params.params[]` 元素字段：



| 字段           | 说明                                                           |
| ------------ | ------------------------------------------------------------ |
| `name`       | 参数名                                                          |
| `annotation` | 类型注解字符串（`<class 'int'>` / `'float'` / `'bool'` / `'list'` 等） |
| `default`    | 默认值                                                          |
| `required`   | 是否必填                                                         |
| `doc`        | 指标说明（前端展示为 tooltip）                                          |

> 约定：
>
> `open/high/low/close/volume`
>
>  及含 
>
> `ndarray`
>
>  的数据型参数为
>
> **自动注入参数**
>
> ，前端不展示、不提交。

### 5.2 生成信号 `ws://…/getLongShortSignal`

请求：



```
{

&#x20; "period": "1d",

&#x20; "symbol": "sh600000",

&#x20; "startTime": "2020-09-01",

&#x20; "endTime": "2026-09-05",

&#x20; "indicators": \[

&#x20;   { "method": "rsi\_buy", "type": "buy", "info": "RSI超卖金叉", "params": { "period": 14 } }

&#x20; ],

&#x20; "t": 1757040000000

}
```

响应：**裸数组**（非外壳）：



```
\[

&#x20; {

&#x20;   "period": "1d",

&#x20;   "datetime": "2026-08-01",

&#x20;   "type": "buy",

&#x20;   "low": 10.05,

&#x20;   "high": 10.5,

&#x20;   "message": "RSI(14) 超卖金叉 @10.20"

&#x20; }

]
```

前端约定：`type=buy` → 多头信号（BULL，锚点用 `low`）；`type=sell` → 空头信号（BEAR，锚点用 `high`）；`period=1d` 时时间归一到当天 00:00。

### 5.3 pybroker 订单 `ws://…/getTradingSignals`

请求：



```
{

&#x20; "symbol": "sh600000",

&#x20; "startTime": "2020-09-01",

&#x20; "endTime": "2026-09-05",

&#x20; "adjust\_type": "none"

}
```

响应：



```
{

&#x20; "code": 0,

&#x20; "data": {

&#x20;   "configs": \[

&#x20;     { "datetime": "2026-08-01", "value": 10.2, "type": "B", "mes": "买入 100股 @10.20" }

&#x20;   ]

&#x20; }

}
```



| 字段         | 说明                                 |
| ---------- | ---------------------------------- |
| `datetime` | 日期 `YYYY-MM-DD`                    |
| `value`    | 标记价格                               |
| `type`     | `B` 买入 / `S` 卖出 / `T` 调仓（对应股票市场标记） |
| `mes`      | 悬停提示消息                             |



***

## 6. 信号质量评测 `ws://…/signalQualityEvaluate`（新增）

> **定位**
>
> ：前端只负责把 “买卖价格 + 时间” 的原始信号
>
> **提交**
>
> 给后台，由后台调用 
>
> **akquant 自带的信号分析评价能力**
>
> 完成质量评估。
> **多空双向**
>
> ：后台支持多头与空头双向评测，
>
> **无需区分开仓 / 平仓**
>
> ，信号即 “在某时间以某价格发生的方向性交易”。
> **前端职责边界**
>
> ：只负责提交与受理确认，不依赖、不解析后台的评测结果（结果由后台自行落库 / 输出）。

### 6.1 请求（前端 → 后台）



```
{

&#x20; "action": "signalQualityEvaluate",

&#x20; "symbol": "sh600000",

&#x20; "period": "1d",

&#x20; "adjust\_type": "none",

&#x20; "signals": \[

&#x20;   {

&#x20;     "direction": "long",

&#x20;     "datetime": "2026-08-01 09:35:00",

&#x20;     "price": 10.25,

&#x20;     "note": "RSI 超卖金叉"

&#x20;   },

&#x20;   {

&#x20;     "direction": "short",

&#x20;     "datetime": "2026-08-05",

&#x20;     "price": 11.30,

&#x20;     "note": ""

&#x20;   }

&#x20; ],

&#x20; "t": 1757040000000

}
```

#### 字段说明



| 字段                    | 类型     | 必填 | 说明                                                              |
| --------------------- | ------ | -- | --------------------------------------------------------------- |
| `action`              | string | ✓  | 固定 `"signalQualityEvaluate"`                                    |
| `symbol`              | string | ✓  | 标的代码（`sh`/`sz`/`bj` 前缀，与 K 线端点一致）                               |
| `period`              | string | ✓  | 信号所在周期，`1d` / `60m` / `5m` …                                    |
| `adjust_type`         | string | ✓  | `none` / `front` / `back`                                       |
| `signals`             | array  | ✓  | 信号数组，长度 ≥ 1                                                     |
| `signals[].direction` | string | ✓  | `"long"` = 做多（买入方向）；`"short"` = 做空（卖出方向）。后台据此方向配对 K 线评测         |
| `signals[].datetime`  | string | ✓  | 信号时间。`YYYY-MM-DD` 或 `YYYY-MM-DD HH:mm:ss`；日线信号请统一给 `YYYY-MM-DD` |
| `signals[].price`     | number | ✓  | 信号触发价格（> 0，浮点，前端最多 4 位小数）                                       |
| `signals[].note`      | string | ✗  | 可选备注（信号来源 / 指标名等，默认空串）                                          |
| `t`                   | number | ✗  | 请求时间戳（毫秒，防缓存 / 去重）                                              |

> **评测口径（后台实现建议）**
>
> ：后台收到后，用 
>
> `symbol`
>
>  对应标的 + 
>
> `period`
>
>  \+ 
>
> `adjust_type`
>
>  拉取 K 线（数据来自通达信），将每条 
>
> `(datetime, price, direction)`
>
>  与 K 线对齐：
> `long`
>
> ：按信号时间后的行情考察买入后的盈亏演化（如持有 N 根 K 线或到达下一个反向信号）；
> `short`
>
> ：方向相反；
> **不关心开平仓配对**
>
> ，每条信号独立评测后聚合统计。

### 6.2 响应（后台 → 前端）

受理确认（后台应尽快返回，仅确认受理；前端收到即完成，不做后续处理）：



```
{

&#x20; "code": 0,

&#x20; "message": "ok",

&#x20; "data": {

&#x20;   "task\_id": "sqe\_20260905\_ab12cd34",

&#x20;   "accepted": 2,

&#x20;   "status": "accepted"

&#x20; }

}
```



| 字段         | 说明                                       |
| ---------- | ---------------------------------------- |
| `task_id`  | 后台评测任务 ID（用于后台日志 / 落库关联）                 |
| `accepted` | 实际受理的信号条数                                |
| `status`   | `"accepted"` 受理中 / `"done"` 已完成（如后台同步完成） |

### 6.3 错误码



| code    | message             | 场景                            |
| ------- | ------------------- | ----------------------------- |
| `0`     | ok                  | 受理成功                          |
| `40001` | invalid symbol      | 标的不存在或格式错误                    |
| `40002` | invalid period      | 周期不合法                         |
| `40003` | invalid signal list | 信号数组为空或结构非法                   |
| `40004` | invalid direction   | `direction` 不是 `long`/`short` |
| `40005` | invalid price       | 价格缺失或 ≤ 0                     |
| `50000` | internal error      | 后台内部错误                        |

错误响应示例：



```
{ "code": 40003, "message": "invalid signal list", "data": null }
```

### 6.4 评测结果数据结构（后台输出建议，供后续展示 / 落库）

后台完成评测后，建议按如下结构落库或经其他通道回传（前端本轮不消费，作为契约预留）：



```
{

&#x20; "task\_id": "sqe\_20260905\_ab12cd34",

&#x20; "symbol": "sh600000",

&#x20; "period": "1d",

&#x20; "evaluated": 2,

&#x20; "summary": {

&#x20;   "total\_signals": 2,

&#x20;   "win\_rate": 0.5,

&#x20;   "profit\_factor": 1.35,

&#x20;   "avg\_return\_pct": 2.1,

&#x20;   "max\_drawdown\_pct": 3.8,

&#x20;   "expectancy\_pct": 1.05,

&#x20;   "sharpe": 0.9

&#x20; },

&#x20; "items": \[

&#x20;   {

&#x20;     "direction": "long",

&#x20;     "datetime": "2026-08-01",

&#x20;     "price": 10.25,

&#x20;     "result": "win",

&#x20;     "return\_pct": 3.2,

&#x20;     "exit\_datetime": "2026-08-05",

&#x20;     "exit\_price": 10.58

&#x20;   }

&#x20; ]

}
```

> 字段仅为推荐口径（对齐 akquant 分析输出），后台可按实际分析维度增减，但
>
> **保持外层&#x20;**
>
> `code/message/data`
>
> **&#x20;与受理响应的字段命名一致**
>
> 。



***

## 7. Python 指标（pyInd）REST API

> **定位**：Indicator 目录的指标依赖 Python 生态（TALib / Numba / torch），浏览器无法直接计算。
> 由后端 Python 计算后生成 JS（`window.__pyInd`），前端动态注册为 klinecharts 指标（主图 / 副图）。
> 前端面板：`src/components/panels/PythonIndicatorPanel.vue`；图表接入：`src/chart/indicators/pyInd.js`。

### 7.1 `GET /api/pyInd/list` —— 指标清单

响应：

```json
{
  "items": [
    {"name": "mew_low_point", "data_param": "arr", "params": [
        {"name": "max_backlook", "annotation": "int", "required": false, "default": 400}
    ], "doc": "计算创新低 N 天"},
    {"name": "bias_rate", "data_param": "close", "params": [
        {"name": "p1", "annotation": "int", "required": true, "default": null}
    ], "doc": "乖离率（BIAS）多均线计算"}
  ],
  "talib_funcs": ["ACOS", "AD", "ADD", "..."]
}
```

| 字段 | 说明 |
|---|---|
| `name` | 指标名（对应 `{name}.js`） |
| `data_param` | 数据参数名。**ohlcv 列名**（close/high/low/open/volume/amount/oi）→ 仅基本数据选择；**非列名**（arr/sequence/speed 等）→ 复合序列（显示分步编辑器） |
| `params[]` | 可配置参数（跳过数据参数）：name / annotation（int/float/bool）/ required / default |
| `talib_funcs` | talib 全部函数名（约 158 个），供分步编辑器的函数下拉分组展示 |

### 7.2 `GET /api/pyInd/{name}.js` —— 计算指标

参数：

| 参数 | 必填 | 说明 |
|---|---|---|
| `code` | 是 | 标的代码（`sh600000` / `600000.SH`） |
| `period` | 否 | 周期，默认 `1d`（1m/5m/15m/30m/1h/1d/1w/1M） |
| `adjust_type` | 否 | 复权 `none/front/back`，默认 `none` |
| `params` | 否 | 指标参数，英文逗号分隔（跳过数据参数；不足补默认、超限报错） |
| `data` | 否 | **复合序列数据表达式**（URL 编码，见 7.3）。空 → 后端按 `data_param` 默认列 |
| `refresh` | 否 | `1` 强制重算（跳过 5min/20 条缓存），默认 `0` |
| `start` / `end` | 否 | 起止日期 `YYYY-MM-DD` |

响应（`application/javascript`，执行后读取 `window.__pyInd`）：

```js
window.__pyInd = {
  "name": "mew_low_point",
  "params": [400],
  "data_expr": "a=talib.MA(close,5); b=percent_change_nb(a); b",
  "symbol": "600000.SH",
  "period": "1d",
  "adjust_type": "none",
  "generated": "2026-09-25 15:30:00",
  "count": 1877,
  "data": [
    {"timestamp": 1546358400000, "value": null},
    {"timestamp": 1546444800000, "value": 1.234567}
  ]
}
```

- `timestamp`：epoch 毫秒（Asia/Shanghai），与 K 线对象时间戳对齐；`value` NaN → `null`
- `data_expr`：实际使用的数据表达式（`data` 或默认列名）
- 错误：`400`/`500`，`detail` 为原因

### 7.3 复合序列数据表达式（data 参数）语法

前端分步编辑器把用户配置序列化为 `;` 分隔的分步表达式提交：

```
a=talib.MA(close,5); b=percent_change_nb(a); b        # 两步：均线 → 变化率，结果 b
a=talib.MACD(close,12,26,9)[1]; percent_change_nb(a)  # MACD 多输出取 SIGNAL 线（[i] 索引）
```

| 参数形式 | 说明 |
|---|---|
| 基本数据 | `close`/`high`/`low`/`open`/`volume`/`amount` 单词 |
| 前序变量 | 引用前面步骤的结果（`a`/`b`/`c`…） |
| 数字 / bool | 如 `5`、`true` |
| 嵌套函数调用 | 任意深度，≤ 10 层 |

- 函数仅限 `talib.*` 或 Indicator 目录指标
- talib 多输出用 `[i]` 索引；无索引时默认取第一个输出
- 前端标签规则：数据参数名非列名 → `{参数名}数据`（如 `arr数据`、`sequence数据`、`speed数据`）+ 复合序列分步编辑；列名 → `{参数名}数据` + 仅基本数据选择

### 7.4 前端分步编辑器交互

- 步骤每行 `a/b/c… = 函数(参数)`，函数下拉分「Indicator 指标」「talib 函数」两组
- 参数行类型：基本数据 / 引用变量（仅前序步骤）/ 数字 / bool
- 步骤可删空（仅用基本数据时 `data` 提交所选列名）；「最终结果」可选任意步骤变量
- 已应用列表展示 `数据: <表达式>` tag；K 线对象变更后按 store 中的 data 表达式自动重放

***

## 8. 变更记录



| 日期         | 变更                                                                   |
| ---------- | -------------------------------------------------------------------- |
| 2026-09-05 | 新增 `signalQualityEvaluate` 端点规格；移除互联网同步端点（`ws_syncData`）说明；数据源统一为通达信 |
| 2026-09-06 | 前端新增多周期切换（1/5/15/30分、60分、日/周/月K）；signalQualityEvaluate 结果卡片展示（报告 file:/// URL + 指标摘要）；评测基准周期固定日线；修复月线周期映射（1M）与信号时区匹配 |
| 2026-09-06 | K线分页加载：`/ws/kline` 请求新增可选 `limit`（非空时后端只返回最近 N 根，升序）；K线时间戳统一按 Asia/Shanghai 序列化（不依赖后端进程时区）；前端 init/forward 均按 limit 分页，滚动可逐级加载更早数据直到数据源边界；K线技术指标启用状态提升至 store，切换标的/重新加载后自动重放 |
| 2026-09-25 | 新增 Python 指标（pyInd）REST API：`/api/pyInd/list`（指标清单 + talib_funcs 158 个）、`/api/pyInd/{name}.js`（后端计算 + 内存缓存 5min/20 条）；`data` 复合序列表达式支持分步流程 / 多序列 / talib 多输出 `[i]` 索引；前端面板改为分步编辑器（基本数据 + 引用变量 + 数字/bool），数据参数名标签规则（arr/sequence/speed 等非列名 → 复合序列，ohlcv 列名 → 仅基本数据） |