# DIALVO

复古 Solana 行情终端。入口采用 Connect To 窗口，任意按钮直接进入战壕；不验证账号、不保存密码，也不要求用户注册。

站点：https://ghostxrun.github.io/DIALVO/

## 数据如何运行

页面通过 DEX Screener 公开 API 获取真实行情，活跃标签页每 8 秒请求当前可见代币报价，每 60 秒重新发现交易对。搜索结果、详情数字、自选和周期切换使用同一份标准化数据。外部图表独立更新。

GitHub Actions 每次提交会验证代码、采集真实行情、运行浏览器验收，再发布仅包含页面与资源的静态包。定时任务约每 15 分钟重新采集并发布行情快照；GitHub 调度可能延迟，以页面显示的实际采集时间为准。行情采集失败则不发布新快照，不生成替代数字。

页面明确区分三种状态：

- `LIVE`：近期收到真实行情响应。
- `SNAPSHOT`：展示发布包中的行情快照及原始采集时间。
- `CACHED`：展示此浏览器上次收到的数据。

网络不可用时保留带时间戳的数据并重试，不会把刷新页面的时间伪装成行情采集时间。市值与 FDV 分开，缺失字段显示 `—`。三栏分别按开池时间、成交额、正涨幅排名，仅覆盖公开源当前收录的交易对，不代表完整链上发行列表。

可选择 5M / 1H / 6H / 24H；手动排序适用于所有三栏。更新价格时保留卡片节点和滚动位置。自选、筛选及紧凑布局保存在当前浏览器。

## 本地运行

需要 Node.js 20 或更高版本，无第三方运行依赖。

```sh
npm start
```

Windows PowerShell 可用 `npm.cmd start`，也可以双击 `start.cmd`。打开 `http://127.0.0.1:1999/`。

Node 服务提供同源行情转发。`GET /api/health` 分别报告本地服务状态与行情源最近连接结果；服务启动不等于行情已连通。

```sh
npm test
npm run snapshot
npm run build:pages
```

后两个命令需要能访问 `https://api.dexscreener.com`。生成的 `public/data/market.json` 和 `dist/` 不提交到 Git。采集器没有返回有效行情时会报错退出。

## 发布与验收

工作流：`.github/workflows/release.yml`。

提交至 `main` 会执行单元测试、真实行情采集及浏览器检查。检查覆盖登录入口、真实响应、后续报价请求、自选持久化、三栏排序、筛选、合约搜索、暂停更新和手机端快照回退。结果与截图保存在 Actions 的 `dialvo-acceptance` artifact。通过后上传 `dist/` 并部署到 GitHub Pages；定时刷新只重新运行测试、采集和发布。

发布后还会直接请求线上首页、战壕、脚本、配色和行情快照，确认展示的是应用而非 README，且快照包含近期采集的真实交易对。如果发布失败，检查 Actions 的失败步骤。GitHub Pages 需已启用，并允许 `github-pages` 环境从 `main` 发布；仓库提供根 `index.html` 和 `.nojekyll`，不会将 README 当作产品首页。

浏览器验收脚本需要 Playwright。CI 会安装它；本地可安装 Playwright 或通过 `PLAYWRIGHT_MODULE` 指定已有模块。`BROWSER_EXECUTABLE` 可指定本机 Chromium / Edge。`--fixture` 仅用于离线交互测试，不会将测试数据写入发布目录；CI 的发布验收使用真实行情源。

## Node / Docker 部署

```sh
docker build -t dialvo .
docker run --rm -p 1999:1999 dialvo
```

Node 托管平台的启动命令为 `npm start`，设置 `HOST=0.0.0.0` 和平台指定的 `PORT`。生产环境由托管平台或反向代理提供 HTTPS。`.env.example` 只列出可配置项，程序读取进程环境变量，不会自动加载 `.env`。

无需 API 密钥。运行环境需要能访问数据源。GitHub Pages 不能运行 Node 服务，因此 Pages 版使用浏览器实时请求与已发布快照；Node / Docker 版另提供同源代理。

## 范围

此项目提供行情浏览、搜索、自选和外部交易入口。GMGN、Solscan 与项目网站在新窗口打开。DIALVO 本身不托管钱包、不签名、不执行交易，也没有账户系统。

行情接口：https://docs.dexscreener.com/api/reference
