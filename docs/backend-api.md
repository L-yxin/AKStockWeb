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

所有端点响应统一使用以下外壳（`/api/signalAnalyze` 见第 6 节专项定义）：



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
| `POST /api/signalAnalyze` | REST | K 线信号表现分析（bool 信号 → 未来 N 根 K 线指标） | `src/components/panels/SignalQualityPanel.vue`      |
| `GET /api/pyInd/list`               | REST | Python 指标清单 + talib 函数 | `src/components/panels/PythonIndicatorPanel.vue`    |
| `GET /api/pyInd/{name}.js`          | REST | 计算 Python 指标（`data` 复合序列） | `src/chart/indicators/pyInd.js`                |
| `GET /api/pyCodeCompletions`        | REST | Monaco 编辑器补全名单（ta/ind/klf） | `src/components/QuantEditor.vue` |
| `GET /api/pyCodeDoc?ns=&name=`       | REST | Monaco hover 文档（签名+docstring） | `src/components/QuantEditor.vue` |
| `GET /api/cloudMetrics/get?name=&start=&end=` | REST | 云指标折线数据（多列不同颜色） | `src/chart/indicators/cloudMetrics.js` |



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
| `source`      | string | 可选。数据来源：`tq` 通达信直拉（默认）/ `cache` 后端内存缓存服务；由设置页 `dataSource` 决定 |

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

## 6. K 线信号表现分析 `POST /api/signalAnalyze`（替代原信号质量评测）

> **定位**：信号质量分析，非回测。输入 **bool 信号序列**（KLineForm 函数名 / pythonCode），
> 分析信号在未来 N 根 K 线（默认 5/10/20/30/60/120）的收益（简单/对数）、胜率、盈亏比、最大回撤、波动率，
> 以及风险调整比率（夏普 / 索提诺 / 卡玛）。
> 不处理开平仓 / 做空 / 手续费 / 滑点 / 资金曲线。
> 原 WS `ws://…/signalQualityEvaluate`（akquant 报告链路）已废弃，后端端点保留兼容，前端不再使用。
> **信号函数范围**：`name` 支持 klf 目录下全部 `@manager_boolean` 包装函数——buy/sell/neutral 根级（`name`=函数名，如 `is_rsi_oversold`）+ 子包级（`name`=`模块.函数`，如 `s01.is_limit_up_pullback`）；前端函数下拉按 买入/卖出/中性/包级（type）分组展示。

### 6.1 请求（前端 → 后台）

`POST http://localhost:8000/api/signalAnalyze`，JSON Body：

```json
{
  "signals": [
    {
      "name": "is_rsi_oversold",
      "displayName": "is_rsi_oversold(6,12,24,30)",
      "symbol": {"code": "000001.SZ", "adjust": "qfq", "start": "2019-01-01", "end": "2026-10-01"},
      "args": ["6,12,24", 30]
    },
    {
      "name": "custom",
      "displayName": "自定义RSI",
      "symbol": {"code": "000001.SZ", "adjust": "qfq", "start": "2019-01-01", "end": "2026-10-01"},
      "pythonCode": "return ta.RSI(c, 9) < 30"
    }
  ],
  "range": {"start": "2020-01-01", "end": "2025-01-01"},
  "horizons": [5, 10, 20, 30, 60, 120],
  "mergeConsecutive": false,
  "returnType": "simple",
  "minSample": 5,
  "period": "1d"
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| signals[].name | string | KLineForm 函数名（后台在 `buy`/`sell` 命名空间查找） |
| signals[].displayName | string | 可选；缺省为 `name(args)` 或 `custom` |
| signals[].symbol | object | `{code, adjust, start, end}`；adjust ∈ `qfq/hfq/none` |
| signals[].args | array | 非自动注入参数（按签名顺序）。Config 参数给字符串（如 `"6,12,24"` → RsiConfig）；bool 支持 `1/0/true/false/on/off/yes/no` |
| signals[].pythonCode | string | 自定义函数体 `return bool序列`。预声明 `o/h/l/c/v/a` 与 `open_/open/high/low/close/volume/amount`；默认导入 `ta`（talib）、`ind`（Indicator）；超时 10s |
| range | object | 观察期 `{start, end}`，独立于 symbol 起止；信号触发时间须落在其内 |
| horizons | array | 未来 K 线节点数（正整数） |
| mergeConsecutive | bool | true 时连续 true 只取组内第一根 |
| returnType | string | `simple` / `log`；两套指标同时计算，前端可切换展示 |
| minSample | int | 某 N 有效样本低于此值 → `insufficient: true`（默认 5） |
| period | string | `1m/5m/15m/30m/1h/1d/1w/1M` |

### 6.2 响应（后台 → 前端）

```json
{
  "code": 0,
  "data": {
    "range": {"start": "2020-01-01", "end": "2025-01-01"},
    "horizons": [5, 10, 20],
    "mergeConsecutive": false,
    "returnType": "simple",
    "minSample": 5,
    "period": "1d",
    "signals": [
      {
        "name": "is_rsi_oversold",
        "displayName": "is_rsi_oversold(6,12,24,30)",
        "symbol": {"code": "000001.SZ", "adjust": "qfq", "start": "...", "end": "..."},
        "period": "1d",
        "kline": [{"timestamp": 1546387200000, "open": 1.0, "high": 1.1, "low": 0.9, "close": 1.05, "volume": 1000}],
        "markers": [{"timestamp": 1579737600000, "value": 2976.53}],
        "signalCount": 168,
        "timeSpan": "20 根 K 线（约 30.9天)",
        "horizons": {
          "5": {
            "count": 168, "insufficient": false,
            "winRateSimple": 0.589, "winRateLog": 0.581,
            "avgReturnSimple": 0.0074, "avgReturnLog": 0.0071,
            "avgWin": 0.0228, "avgLoss": -0.0146,
            "profitLossRatio": 1.555,
            "sharpe": 0.126, "sortino": 0.165, "calmar": 0.096,
            "maxDrawdown": {"avg": 0.0154, "median": 0.0114, "max": 0.0772, "distribution": []},
            "volatility": {"pooled": 0.0118, "avg": 0.012, "median": 0.01, "max": 0.03, "distribution": []}
          }
        }
      }
    ],
    "errors": [{"name": "xxx", "displayName": "xxx", "error": "KLineForm 中未找到函数: xxx"}]
  }
}
```

| 字段 | 说明 |
|---|---|
| signals[].kline | 该信号标的的 K 线数组（timestamp epoch 毫秒，Asia/Shanghai），供前端渲染主图 |
| signals[].markers | 观察期内信号触发点 `{timestamp, value}`（value=信号日收盘价），供主图打标记 |
| signals[].signalCount | 观察期内有效信号数 |
| signals[].timeSpan | 某 N 有效窗口实际时间跨度均值（如 `20 根 K 线（约 30.9天)`） |
| signals[].horizons[N].count | 有效样本数（含 0 收益样本） |
| signals[].horizons[N].insufficient | 有效样本 < minSample |
| winRate* / avgReturn* / avgWin / avgLoss | 胜率 / 平均收益 / 平均盈利 / 平均亏损（Simple 与 Log 各一套） |
| profitLossRatio | 盈亏比；`null` = 无亏损（前端显示 ∞） |
| sharpe / sortino / calmar | 夏普 / 索提诺 / 卡玛（simple 口径）：夏普=池化日收益均值/标准差（n-1）；索提诺=均值/下行标准差；卡玛=N 期平均收益/最大回撤；分母 0 → `null`（前端显示 `-`，全涨无回撤时卡玛为 null） |
| maxDrawdown | `{avg, median, max, distribution}`，**回撤幅度（正数 0~1）**，窗口内 `max(dd[1:])`（排除信号日自身 t=0 恒 0） |
| volatility | `{pooled, avg, median, max, distribution}`，日收益率样本标准差（n-1，不年化） |
| errors | 无效信号列表（单条信号失败不影响其他信号） |

### 6.3 错误码

| HTTP | 场景 |
|---|---|
| 200 | 正常（含部分信号无效，见 `errors`） |
| 400 | 参数错误：缺少 signals / range 起止颠倒 / 非法参数 |
| 500 | 后端计算异常 |

### 6.4 缓存与交互

- K 线按 `code|period|adjust|start|end` LRU 缓存（32 条）；bool 序列按信号指纹 LRU 缓存（128 条）。
- **观察期滑块变化 → 前端重新请求 → 后端复用缓存 K 线与 bool 序列，仅重新过滤与重算**。
- 前端面板：`src/components/panels/SignalQualityPanel.vue`（信号编辑器 + 主图信号标记 + 统计表格 + 柱状图 + 分布图）。
- 图表：**K 线主图用 klinecharts（`simpleAnnotation2` overlay 打标记，分析完成即叠加到主页 K 线图，重新分析刷新全部标记）**；柱状图/分布图用 echarts。

### 6.5 Monaco 编辑器（pythonCode 输入）

信号编辑器内置 Monaco Editor（`src/components/QuantEditor.vue`），支持 Python 语法高亮、ta/ind/klf 智能补全与 hover 文档。

| 端点 | 说明 |
|---|---|
| `GET /api/pyCodeCompletions` | 返回 `{code:0, data:{ta:[...], ind:[...], klf:[...]}}`。`ta` 为 talib 函数名，`ind` 为 Indicator 目录函数，`klf` 为 KLineForm 信号（`buy.xxx`/`sell.xxx`）。启动时 fetch 一次 |
| `GET /api/pyCodeDoc?ns=ta&name=RSI` | 返回 `{code:0, data:{ns, name, signature, doc}}`。`signature` 为函数签名，`doc` 为 docstring（markdown 格式）。Monaco hover provider 鼠标悬浮时调用 |

**pythonCode 执行环境**（后端 `signal_analyzer.py::_gen_pycode_signal`）：
- 预声明变量：`o/h/l/c/v/a`（简称）与 `open_/high/low/close/volume/amount`（全名）
- 默认导入：`numpy as np`、`talib as ta`、`Indicator as ind`、`KLineForm as klf`
- **开发模式热重载**：每次执行前 `importlib.reload(ind)` 与 `importlib.reload(klf)`，改 `.py` 文件不用重启 FastAPI（numba @njit 首次 reload 重新 JIT 编译，后续命中缓存）
- 用户代码写法：函数体形式，`return ta.RSI(c, 9) < 30`

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
| `data_params` | 全部数据参数名（如 sr_width 的 `[relative_low, relative_high]`）；列名参数前端隐藏（后端默认取该列） |
| `signature` | 完整签名（保持参数顺序），每项 `{name, annotation, kind, required, default}`；`kind` ∈ `data`/`fin`（财务 FN，自动注入，前端忽略）/`param`（表单参数） |
| `params[]` | 可配置参数（kind=param）：name / annotation（int/float/bool/**str**/ndarray）/ required / default。**str 参数**（如 t_pivot_r 的 `style`）文本输入、原样提交；`ndarray` 参数前端忽略（不渲染输入框、不提交），后端按参数名自动注入：FN 编号（FN1/FN2…）→ 财务数据（TTM 化）；K 线列名（low/high…）→ K 线对应列（如 t_sr_position 的 low/high） |
| `doc` | docstring 第一行（下拉展示）；`doc02` 完整 docstring（"详细文档"只读框） |
| `talib_funcs` | talib 全部函数名（约 158 个），供分步编辑器的函数下拉分组展示 |

> **财务字段（pe / pe_ratio_to_ma）**：数据参数后的 `ndarray` 参数为通达信专业财务字段
> （FN1 基本每股收益 / FN2 扣非 / FN501 稀释 / FN311 单季）。前端忽略该字段；
> 后端 `/api/pyInd/{name}.js` 识别后自动经 `tq.get_financial_data(announce_time)` 拉取，
> **先滚动年化（TTM）**：累计口径 TTM(r) = 最新报告期 + 上年年报 − 上年同期（单季口径滚动 4 期），
> 再按公告日期阶梯对齐到 K 线（前向填充、发布日跳变、无未来函数），与 K 线等长后注入指标。
> 因此 pe 为**滚动市盈率（TTM PE）**，无季节性锯齿。

### 7.2 `GET /api/pyInd/{name}.js` —— 计算指标

参数：

| 参数 | 必填 | 说明 |
|---|---|---|
| `code` | 是 | 标的代码（`sh600000` / `600000.SH`） |
| `period` | 否 | 周期，默认 `1d`（1m/5m/15m/30m/1h/1d/1w/1M） |
| `adjust_type` | 否 | 复权 `none/front/back`，默认 `none` |
| `params` | 否 | 指标参数，英文逗号分隔（跳过数据参数；不足补默认、超限报错）。按签名转换：int/float 数字、bool（0/1、true/false）、**str 原样**（如 `t_pivot_r` 的 `params=3,classic`） |
| `data` | 否 | **复合序列数据表达式**（URL 编码，见 7.3）。空 → 后端按 `data_param` 默认列 |
| `stocks` | 否 | **多股票代码列表**（英文逗号分隔，如 `600000.SH,000001.SZ`）。仅对签名含 `stocks` 参数（StocksData 注解，如 Indicator/alpha101 横截面因子）的指标生效：后端按签名需要的字段拉取多股票 K 线自动注入；不传时以 `code` 单标的兜底（横截面 rank 退化为常数） |
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

**多线指标**（返回 `(线数, n)`，如 `platform_box` 上下沿）：输出 `lines` 数组替代 `data`：

```js
window.__pyInd = {
  "name": "platform_box",
  "multi": true,
  "count": 666,
  "lines": [
    {"key": "line0", "title": "line0", "data": [{"timestamp": 1704124800000, "value": null}, {"timestamp": 1704211200000, "value": 11.32}]},
    {"key": "line1", "title": "line1", "data": [{"timestamp": 1704124800000, "value": null}, {"timestamp": 1704211200000, "value": 10.35}]}
  ]
}
```

- 前端 `src/chart/indicators/pyInd.js` 按 `lines` 注册多条 figure（调色盘分色），主图/副图均可叠加
- 复合表达式中引用多线指标：按行拆 tuple，`a=platform_box(...)` 默认取第一行，`a[1]` 取第二行（与 talib 多输出一致）

**URL 深链 `pyInd` 参数**（`src/urlParams.js` 支持）：

- 语法：`pyInd=名称[:data=表达式;参数名=值;...;main=1]`，`|` 分隔多指标；参数为**命名式**（未列出的参数用后端默认值）
- `data` 特殊键：数据表达式，**必须为段内第一个键且值不含 `;` / `|`**（复合表达式请在面板配置）；`main=1` 显式主图（缺省副图）
- 示例：`pyInd=alpha089:data=close;main=1|platform_box:window=20;max_amp=0.1|bias_rate`
- 生成工具：`make_akstock_url(code, ..., py_indicators=[{"name":"alpha089","params":{"data":"close"},"main":True}])`（`webapi/webtool/make_akstock_url`）

**Alpha101 横截面因子（`stocks` 多股票注入）**：

- 实现：`Indicator/alpha101/` 100 个横截面因子（alpha002~alpha101，源自原 `use_packages/Quant_Alpha101`，use_packages 已删除）；`KLineForm/managerTool.py` 的 `StocksData` 容器（`{symbol: {field: 等长数值序列}}`，至少 close）；选股适配层 `KLineForm/StockSelectionStrategy/alpha101`（`select_stocks(stocks, factor, top_n, **params) -> [(symbol, score)]` 按最新因子值降序、预热期 NaN 排末尾，`rank_stocks` 别名，`list_factors()`）
- 签名：`def alpha0XX(<data: np.ndarray>, <数值参数>, stocks: Optional[StocksData] = None) -> np.ndarray`；data 参数（open/high/low/close/volume/vwap/returns/advN 等）`1D`=单股票、`2D`=多股票（行=日期，列=股票）；FN 编号参数（`fn238` 等，`kind='fin'`）=财务字段自动注入；返回 1D 等长 或 2D（行=日期，列=股票，预热期 NaN）
- 后端注入：StocksData 注解参数在 `signature` 中标记 `kind='stocks'`（前端参数表隐藏、不占 `params`）；签名含 stocks 时按 URL `stocks` 逐票 `fetch_kline_df` 拉 K 线，公共交易日 reindex 对齐（停牌日 NaN），推导 `vwap=amount/(volume*100)`、`returns=close 日收益`、`advN=volume 滚动 N 日均量`，并注入签名 `kind='fin'` 的 FN 财务字段（`fn238` 等，`fetch_financial_df` 公告日阶梯对齐公共日；存量字段 FN238/FN239 不 TTM、其余滚动 TTM）后组装 StocksData 注入，data/fin 参数置 None 由因子内部构建横截面 DataFrame；**市值不再后端注入**——cap 由因子函数内部计算（`cap = fn238 × close`，fn238 = 通达信 FN238 总股本）；**单股票路径**签名含 `fn238` 等 fin 参数时同样自动注入（与 K 线等长）
- 返回多线：因子 2D `(n_dates, n_stocks)` 转置为 `(n_stocks, n_dates)` 后走多线协议——**每只股票一条线**（line0/line1…）；JS 输出新增 `"stocks"` 字段（实际注入的股票列表）

### 7.3 复合序列数据表达式（data 参数）语法

前端分步编辑器把用户配置序列化为 `;` 分隔的分步表达式提交：

```
a=talib.MA(close,5); b=percent_change_nb(a); b        # 两步：均线 → 变化率，结果 b
a=talib.MACD(close,12,26,9)[1]; percent_change_nb(a)  # MACD 多输出取 SIGNAL 线（[i] 索引）
```

| 参数形式 | 说明 |
|---|---|
| 基本数据 | `close`/`high`/`low`/`open`/`volume`/`amount` 单词 |
| 前序变量 | 引用前面步骤的结果（`a`/`b`/`c`…，含**跨数据参数**） |
| 数字 / bool | 如 `5`、`true` |
| 字符串字面量 | `'classic'` / `"pivot"`（单双引号均可） |
| 嵌套函数调用 | 任意深度，≤ 10 层 |

- 函数仅限 `talib.*` 或 Indicator 目录指标
- talib 多输出用 `[i]` 索引；无索引时默认取第一个输出
- **跨数据参数共享变量**：多数据参数（如 sr_width 的 relative_low/relative_high）按签名顺序共享同一变量环境，后序表达式可直接引用前序编辑区变量（如 `b=sr_width(a,high)` 中的 `a`）
- 前端标签规则：数据参数名非列名 → `{参数名}数据`（如 `arr数据`、`sequence数据`、`speed数据`）+ 复合序列分步编辑；列名 → `{参数名}数据` + 仅基本数据选择

### 7.4 前端分步编辑器交互

- 步骤每行「第 N 步 = 函数(参数)」，函数下拉分「Indicator 指标」「talib 函数」两组
- **选择 Indicator 指标后参数自动预填**（按 `signature`：data → 对应数据列、数字 → 默认值、bool → 0/1、str → 字符串），用户只需改值；talib 无签名信息保留手动类型（基本数据 / 引用变量 / 数字 / bool / 字符串）
- **数据参数（kind=data）值下拉合并两组**：基本数据列（`col:列名`）+ 前序步骤（`var:全局变量下标`，含跨编辑区），支持嵌套复合；类型标注动态（列 / 引用）
- 变量命名跨编辑区**全局连续**（a/b/c… → d/e/f…），提交无同名冲突
- 步骤可删空（仅用基本数据时 `data` 提交所选列名）；多步时「最终结果」可选任意步骤（显示 `第 N 步：函数名`）
- 普通参数表单：int/float 文本输入、bool 0/1 下拉、**str 文本输入**（默认值预填）、类型标注（int/float/0-1/str）
- 「详细文档」只读框展示 `doc02`（完整 __doc__）；指标下拉选中区只显示 `doc` 描述（可搜索）
- 已应用列表展示 `数据: <表达式>` tag；K 线对象变更后按 store 中的 data 表达式自动重放

### 7.5 面板「已应用」交互（前端行为）

- **重开面板恢复**：`PythonIndicatorPanel` 挂载时从 `searchStore.pythonIndicators` 恢复已应用列表（组件本地状态销毁不丢）；图表上的指标由 `kLineView.initChart()` 按 store 重放
- **编辑已应用项**：已应用行「编辑」按钮（✎）→ 回填指标/参数/位置/数据源（`data` 表达式自动逆解析为分步编辑器：`a=talib.MA(close,5);a` → 第 1 步 talib.MA + col:close + 数字 5），修改后点「添加 / 刷新」覆盖更新（store 同步、图表重建）
- **股票切换竞态防护**：`pyInd.js` 拉取 JS 前记录发起时标的，响应返回后若 `store.symbol` 已变则丢弃（防快速切换时旧标的响应覆盖新图表）；切换后重放始终以当前 `store.symbol` 计算
- 已应用列表支持删除（🗑）与强制重算（后端 refresh=1 绕过 5 分钟缓存）

***

## 8. 变更记录



| 日期         | 变更                                                                   |
| ---------- | -------------------------------------------------------------------- |
| 2026-09-05 | 新增 `signalQualityEvaluate` 端点规格；移除互联网同步端点（`ws_syncData`）说明；数据源统一为通达信 |
| 2026-09-06 | 前端新增多周期切换（1/5/15/30分、60分、日/周/月K）；signalQualityEvaluate 结果卡片展示（报告 file:/// URL + 指标摘要）；评测基准周期固定日线；修复月线周期映射（1M）与信号时区匹配 |
| 2026-09-06 | K线分页加载：`/ws/kline` 请求新增可选 `limit`（非空时后端只返回最近 N 根，升序）；K线时间戳统一按 Asia/Shanghai 序列化（不依赖后端进程时区）；前端 init/forward 均按 limit 分页，滚动可逐级加载更早数据直到数据源边界；K线技术指标启用状态提升至 store，切换标的/重新加载后自动重放 |
| 2026-09-25 | 新增 Python 指标（pyInd）REST API：`/api/pyInd/list`（指标清单 + talib_funcs 158 个）、`/api/pyInd/{name}.js`（后端计算 + 内存缓存 5min/20 条）；`data` 复合序列表达式支持分步流程 / 多序列 / talib 多输出 `[i]` 索引；前端面板改为分步编辑器（基本数据 + 引用变量 + 数字/bool），数据参数名标签规则（arr/sequence/speed 等非列名 → 复合序列，ohlcv 列名 → 仅基本数据） |
| 2026-09-25 | pyInd 财务字段自动拉取：`ndarray`（FN 编号）参数前端忽略、后端自动拉取通达信专业财务数据并按公告日期阶梯对齐；新增 t_value_reversion（t_pe / t_pe_ratio_to_ma / t_linreg_zscore） |
| 2026-09-25 | 滚动市盈率（TTM）：财务字段注入前自动滚动年化（累计口径 TTM 公式 / 单季滚动 4 期），t_pe 输出 TTM PE，消除季节性跳变 |
| 2026-09-26 | 多数据参数支持：`data` 参数支持 JSON 对象（多数据参数如 sr_width 的 relative_low/relative_high）；前端每数据参数独立分步编辑器，列名参数隐藏（后端默认该列） |
| 2026-09-26 | pyInd 填写方式优化：选择 Indicator 函数后按 `signature` 自动预填参数（数据列/默认值/0-1）；步骤参数显示"参数名+类型标注"；bool 改 0/1 下拉；步骤编辑器极简化（删除基本数据行与复合序列分区，单步无最终结果） |
| 2026-09-26 | 复合类型完善：数据参数值下拉合并"基本数据列 + 前序步骤"（跨编辑区），值编码 `col:列名` / `var:全局变量下标`；后端 `_resolve_data_expr` 支持共享 env，多数据参数按签名顺序共享变量（后序可引用前序编辑区步骤）；变量命名跨编辑区全局连续（a/b/c…d/e/f…） |
| 2026-09-26 | 字符串参数支持：`signature` 增加 `str` 类型（如 t_pivot_r 的 style）；`_parse_params` 原样接收字符串；表达式支持字符串字面量 `'xxx'`/`"xxx"`；前端参数表单与步骤编辑器支持 string 类型 |
| 2026-09-27 | 文档与 UI：指标下拉选中区只显示 `doc` 描述（可搜索）、下拉面板显示"名称—完整描述"（多行）；新增"详细文档"只读框（`doc02` 完整 __doc__） |
| 2026-10-02 | 信号质量评测 → K 线信号表现分析：新增 `POST /api/signalAnalyze`（REST）——输入 bool 信号序列（KLineForm 函数 / pythonCode），分析未来 N 根 K 线（5/10/20/30/60/120）收益/胜率/盈亏比/回撤/波动率；观察期滑块变化后端复用缓存仅重算；`SignalQualityPanel.vue` 改为信号编辑器 + K 线主图标记 + 统计表格 + 柱状图 + 分布图；原 WS `signalQualityEvaluate` 废弃保留兼容 |
| 2026-10-02 | signalAnalyze 完善：修复最大回撤恒 0 bug（回撤改正数幅度，排除信号日自身）；新增夏普/索提诺/卡玛三比率（分母 0 → null）；面板移除内嵌 K 线图，信号标记叠加到主页 K 线图（红「买」标签+方向线），统计表/柱状图新增三比率 |
| 2026-10-02 | KLineForm 信号函数返回值统一为 bool ndarray：删除 ManagerBoolean 包装类与 `__original_return_value__` 属性；talib K 线形态函数（吞没/孕线/晨星/黄昏星等）内部直接 `== 100` / `== -100` 返回 bool；装饰器 `manager_boolean` 仅做参数校验 + integer→bool 转换；新增 `platform_box_breakout`（平台箱体上沿突破）信号 |
| 2026-10-02 | 后端热重载：`signal_analyzer.py` 四处加 `importlib.reload`（pythonCode 执行 / KLineForm 函数查找 / 补全名单 / hover 文档），改 Indicator/KLineForm 的 .py 文件不用重启 FastAPI；numba @njit 首次 reload 重新 JIT 编译 |
| 2026-10-10 | 股票数据内存缓存服务（webapi `stock_cache.py`）：新增 REST 端点 `/api/v1/stocks/{symbol}`（懒加载）、`/api/v1/stocks/batch`、`/api/v1/cache/warmup`、`/api/v1/cache/stats`、`DELETE /api/v1/cache/{symbol}`、`DELETE /api/v1/cache`、`/api/v1/health`；缓存键 `(symbol, period, adjust)`，TTL 30min、预算 10GiB（环境变量可配）、近似 LRU 逐出、后台 sweeper 兜底；`/ws/kline` 请求新增可选 `source`（`tq` 直拉默认 / `cache` 走缓存服务）；回测程序可先 warmup 再统一走缓存 API |
| 2026-10-10 | 前端设置页：新增 `/settings` 路由（`Settings.vue`）——K 线数据来源切换（通达信直拉 / 内存缓存，store `dataSource` 默认 `tq`）、缓存状态卡片（entries/used_gb/利用率/TTL）、清空缓存按钮；home 菜单新增「设置」入口、状态栏动态显示当前数据源；`src/api/index.js` 新增缓存服务封装（`getCacheStats` / `clearCache` / `evictCacheSymbol` / `getCachedKline`） |
| 2026-10-02 | Monaco Editor 集成：`QuantEditor.vue` 静态 import monaco，启动时 fetch `/api/pyCodeCompletions` 获取 ta/ind/klf 补全名单，hover provider fetch `/api/pyCodeDoc` 返回签名+docstring；`CodeEditorDialog.vue` 为可拖拽/可缩放弹窗 |
| 2026-10-11 | 后台管理（webapi `admin_controller.py` + `/api/admin/*`）：**数据预加载**——基于 `webapi/data/` 下 `watchlist.json`（自选组）与 `sector_cache.json`（已缓存板块成分 `sector_stocks:*` / 指数成分 `index_stocks:*`）提取股票代码清单，`GET /api/admin/preload/plan` 返回去重统计 + 样例，`POST /api/admin/preload` 预热到内存缓存（复权/周期/区间/数量上限可配，返回成功/失败/耗时/最新 stats）；**缓存策略调整**——`stock_cache.py` 配置改为运行时可变（`set_config`），`GET/POST /api/admin/cache/config`（等价 `/api/v1/cache/config`）调整内存预算 / TTL / 清理扫描间隔，立即生效无需重启，调小预算同步逐出 |
| 2026-10-11 | 前端后台管理页：`/admin` 路由（`AdminPanel.vue`）——数据预加载（来源勾选自选/板块/指数 + 计划统计样例 + 参数表单 + 执行结果）、缓存策略调整（预算/TTL/扫描间隔保存即生效）、缓存状态卡；`Settings.vue` 新增「后台管理」入口卡片跳转 `/admin`；`src/api/index.js` 新增 `getPreloadPlan` / `runPreload` / `getCacheConfig` / `setCacheConfig` |
| 2026-10-11 | 后台管理增强：①**分组精确选择**——`GET /api/admin/preload/sources` 返回可勾选分组明细（自选组 `wl_*` / 板块 `sector_stocks:*` / 指数 `index_stocks:*`，组名映射自 `sector_list` 与 `INDEX_GROUPS`，含各组合计数）；`POST /api/admin/preload` 新增 `groups` 字段按组 id 精确提取（兼容原 `sources` 粗粒度）②**配置持久化**——`GET/POST /api/admin/settings` 读写 `webapi/data/setting.json`（预加载选择 + 缓存策略），保存时同步应用缓存策略；`main.py` lifespan 启动时自动恢复保存的缓存策略 ③**滚动修复**——`src/style.css` `body{overflow:hidden}`（K线全屏布局）导致长页面不可滚动，`Settings.vue` / `AdminPanel.vue` 根元素改 `height:100%; overflow-y:auto` 自行滚动 |
| 2026-10-11 | **数据来源持久化**：设置页「数据来源」（通达信直拉 tq / 内存缓存 cache）选择保存到后端 `data/setting.json`（`GET/POST /api/admin/settings` 的 `dataSource` 字段，仅接受 tq/cache）；前端 `Settings.vue` 切换时异步 `saveAdminSettings({dataSource})`、打开页面时 `restoreDataSource()` 恢复；`App.vue` 启动时读取后端恢复数据源（早于 K 线首次加载），刷新页面不丢失选择 |
| 2026-10-18 | pyInd 面板三处修复：①**重开面板恢复已应用**——`PythonIndicatorPanel.vue` 挂载时从 store 恢复 `appliedList`（此前组件销毁即丢，图表上指标仍由 initChart 重放，造成"已应用不显示但 K 线技术指标可见"）；②**编辑已应用项**——已应用行新增「编辑」按钮，点击回填指标/参数/位置/数据源（`data` 表达式逆解析为分步编辑器），修改后「添加 / 刷新」覆盖更新；③**股票切换竞态防护**——`pyInd.js` 拉取 JS 后校验发起时标的与当前 `store.symbol`，不一致即丢弃，防快速切换时旧标的响应覆盖新图表；切换后重放始终以当前 symbol 计算 |
| 2026-10-11 | **标记分组隔离**：买卖提示（`ls`）/ pybroker 订单（`trades`）/ 信号表现分析（`sa`）/ 模拟交易（`sim`）四类 K 线标记改用 klinecharts `groupId` 分组（`createOverlay({groupId})` + `removeOverlay({groupId})`），各功能开启/清除互不影响，相互独立开关；股票切换等全量场景仍全清（`clearAllMarkers` 不传组） |
| 2026-10-11 | **热更新排除**：新增 `webapi/run_server.py` 启动脚本（`uvicorn.run(reload_excludes=[...])`），排除 `stockSelection / Strategy / test / use_packages / MarketSentiment / webapi/test` 目录的改动触发后端重载；规避命令行 `--reload-exclude "**"` 在 Windows 终端被通配符展开的报错 |
| 2026-10-11 | **URL 双重编码兼容**：`src/urlParams.js` 新增幂等安全解码 `safeExtraDecode`（仅当串仍含 `%xx` 时再解一次，明文/单次编码 URL 不受影响），应用于 `parseIndicators` 与 `parseLsParam`——修复 URL 整段被二次编码（如 `%25E6...`、`%7C`）时中文指标名匹配不到、提示"目录中不存在"的问题；`tool/make_akstock_url.py` 本身为单次编码（正确），无需改动 |
| 2026-10-18 | Alpha101 横截面因子迁移：新增 `Indicator/alpha101/`（100 个横截面因子 alpha002~alpha101，源自原 `use_packages/Quant_Alpha101`，use_packages 已删除）；`KLineForm/managerTool.py` 新增 `StocksData` 多股票行情容器（`{symbol:{field:等长序列}}`）；`/api/pyInd/{name}.js` 新增可选 `stocks` 参数（逗号分隔股票代码）——StocksData 注解参数注册为 `kind='stocks'`（前端隐藏、不占 params），后端按签名需要字段拉多股票 K 线、公共交易日对齐（停牌 NaN）并推导 vwap/returns/advN 自动注入，2D 返回转置为按股多线（每线一只股票）、JS 输出新增 `stocks` 字段；新增选股适配层 `KLineForm/StockSelectionStrategy/alpha101`（select_stocks/rank_stocks/list_factors，按最新因子值降序） |