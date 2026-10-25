# DIALVO

复古 Solana 行情终端，使用 Logo 的深海军蓝、青蓝和米白配色。

入口采用 Connect To 连接窗口。按照当前产品要求，入口中的任意按钮直接进入战壕，不执行账号验证。此项目没有账户系统，也不会保存密码。

## 本地运行

需要 Node.js 20 或更高版本，无第三方运行依赖。

```sh
npm start
```

打开 `http://127.0.0.1:1999/`。Windows 也可以双击 `start.cmd`。

```sh
npm test
```

## 页面

- `/`：连接入口。
- `/dialvo-frontend.html`、`/dialvo-login.html`：兼容原文件名的入口。
- `/dialvo-terminal.html#trenches`：战壕。
- `/api/health`：服务健康状态与行情源最近连接结果。

## 行情

通过服务端访问 DEX Screener 公开接口，前后端同源。前端每 8 秒请求现有代币报价，每 60 秒重新发现交易对；搜索结果和代币详情也更新报价。数据源可能有延迟，相邻请求的价格可能相同。

展示价格、市值、FDV、流动性、成交额和买卖笔数。市值和 FDV 分开，缺失字段显示 `—`。三栏按开池时间、成交额、正涨幅排序，仅覆盖当前接口收录范围，并非全链扫描。

行情源不可达时显示连接错误，并保留带更新时间的上次成功结果。项目不生成随机行情、虚构钱包或成交记录。首次启动时若没有连接过行情源，页面保持空状态。图表嵌入 DEX Screener，更新周期由图表服务控制。

外部交易入口跳转 GMGN；项目本身不签名、不托管钱包、不执行交易。

## Docker 部署

```sh
docker build -t dialvo .
docker run --rm -p 1999:1999 dialvo
```

部署到支持 Node.js 的服务器时，启动命令为 `npm start`。设置 `HOST=0.0.0.0`，并按平台要求设置 `PORT`，以便接收外部请求。生产环境应由反向代理或托管平台提供 HTTPS。

`.env.example` 仅记录配置项；程序读取进程环境变量，不会自动加载 `.env`。无需 API 密钥。运行环境需要能够访问 `https://api.dexscreener.com` 和图表站点。

将代码上传到 GitHub 不等于已经发布网站。GitHub Pages 可提供静态页面，但不能运行此 Node.js 行情转发服务；完整运行应部署 Node.js 服务或 Docker 容器。

## 目录

```text
public/
  index.html
  dialvo-login.html
  dialvo-frontend.html
  dialvo-terminal.html
  assets/
  scripts/
  styles/
server.cjs
test/
Dockerfile
package.json
```

接口文档：https://docs.dexscreener.com/api/reference
