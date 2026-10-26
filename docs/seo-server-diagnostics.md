# SEO 服务器只读诊断

这项工具用于核对实际生效的 1Panel/OpenResty 配置，减少手工切目录、判断容器和反复复制命令。它不会修复配置、部署应用、重载 OpenResty、申请证书、读取 `.env` 或修改生产数据。

## 1. 一次性确认 GitHub 接入

工作流：`.github/workflows/seo-diagnostics.yml`，GitHub Actions 中名称为 **SEO server diagnostics**。

进入仓库 **Settings → Secrets and variables → Actions → Secrets**。可以复用已有生产部署的 Repository secrets；也可以在 **Settings → Environments → production → Environment secrets** 中配置。工作流引用 `production` 环境，同名的环境 Secret 会优先于仓库 Secret。

| 名称 | 内容 | 是否必需 |
| --- | --- | --- |
| `PROD_HOST` | 实际生产服务器 IP 或 SSH 域名，只填主机，不带 `ssh://` 或端口 | 服务器诊断必需 |
| `PROD_USER` | 原部署用户，例如 `ubuntu` | 服务器诊断必需 |
| `PROD_SSH_KEY` | 对应账号可登录的完整 OpenSSH 私钥，保留真实换行；当前工作流不使用口令代理 | 服务器诊断必需 |
| `PROD_KNOWN_HOSTS` | 已验证身份的服务器 SSH 主机公钥记录（known_hosts 格式） | 服务器诊断必需 |
| `PROD_PATH` | 已有生产项目目录，例如 `/home/ubuntu/full-stack-songdian` | 可选；未填时从运行容器的 Compose 标签识别 |

如果 SSH 端口不是 22，在相同作用域的 **Variables** 设置 `PROD_SSH_PORT`。`SEO_INDEXABLE` 等公开构建变量仍按原生产流程配置；本诊断不会修改它们。

注意区分：`PROD_SSH_KEY` 是登录用私钥，`PROD_KNOWN_HOSTS` 是服务器身份记录。两者不能用 GitHub Token、登录密码或 SSL 证书替代。不要把任何私钥或密码贴进聊天。

如果之前没有配置 SSH 密钥部署，需要先通过云服务器已有的密钥管理方式接入。此工具不创建 SSH 用户、不修改 `authorized_keys` 或 `sudoers`。复用的部署账号可能有更广权限，工作流本身只执行诊断命令。

服务器要求：Python 3、Docker CLI，以及部署用户现有的 Docker 查询/执行权限。不自动使用 `sudo`。OpenResty 容器中的 `openssl` 不存在时，会标记证书文件详情不可读取，不读取或输出证书/私钥文件原文。

`PROD_KNOWN_HOSTS` 必须经过核验。可以从受信任的云控制台读取服务器公钥指纹：

```bash
ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub
```

再将 `ssh-keyscan -t ed25519 -p 实际SSH端口 实际服务器主机` 得到的记录保存为本地文件，使用 `ssh-keygen -lf 本地文件` 比较指纹，一致后将记录填入 Secret。扫描结果本身不能证明服务器身份。SSH 使用 `StrictHostKeyChecking=yes`，不会自动接受未知主机。

## 2. 运行一次诊断

1. 将工作流和脚本提交到仓库默认分支后，打开 **Actions → SEO server diagnostics → Run workflow**。
2. Branch 选择默认分支 `master`。
3. 接入已完成时，保留 `inspect_server=true`。未配置 SSH 时，可取消勾选，先运行公网诊断；这不代表服务器配置已检查。
4. 点击 **Run workflow**。如果已有 `production` 环境的审批规则，按原规则批准这次只读诊断。
5. 查看运行页面的 **Summary**，并在 **Artifacts** 下载 `seo-diagnostics`。

工作流只手动触发，不会随 push 自动运行，不会启动 `Deploy production`。没有 `image_version` 输入，也不需要重新构建 Docker 镜像。

## 3. 报告内容与失败含义

| 文件 | 内容 |
| --- | --- |
| `public.json` / `public.md` | www/根域 HTTP、HTTPS、重复斜杠、带查询参数路径的 TLS 与逐跳响应；全程验证证书 |
| `seo-smoke.log` | 既有检查器的真实 Sitemap XML、公开 API 完整性、Canonical、robots 指令检查 |
| `server.json` / `server.md` | 面板版本、OpenResty 实际配置测试、目标/默认站点、公开证书 SAN 与日期、应用镜像、公开 SEO 变量、识别到的部署目录 |

只提取允许的配置字段，不保存完整 `nginx -T` 输出、认证 Header、私钥配置项或真实 `.env`。SSH 的异常输出、启动横幅和无法解析的输出不会直接上传。报告包含诊断所需的容器名称、应用镜像和配置文件路径，保留 7 天。

证书/重定向存在错误时，工作流会显示失败，报告仍会上传。`continue-on-error` 仅用于完成其他诊断，最后的状态检查不会将错误变成成功。公网失败也不会阻止已经授权的服务器只读诊断。

常见情况：

- `tls_verification_failed`：相应入口的证书验证失败。三个入口可能因为同一个根域证书问题而同时失败。
- `repeated_slash`：跳转规则产生重复路径斜杠。
- `Missing production SSH secret`：先补齐对应 Secret，或取消服务器检查，仅运行公网检查。
- `ssh_diagnostic_failed`：检查账号、端口、密钥格式、主机身份记录和 Python 3。原始 SSH 输出被过滤，不在报告中显示。
- `docker_unavailable`：部署账号无法访问 Docker；使用原有可运行部署的账号核对权限。
- `openresty_ambiguous`：发现零个或多个 OpenResty 容器，不猜测目标，也不做修改。
- `nginx_summary_incomplete`：配置中有当前提取器不支持的语法，不能把摘要里缺少某项当作实际配置缺失。
- `project_directory_mismatch`：填写的 `PROD_PATH` 与运行应用的 Compose 目录不同。

镜像标签与服务器 checkout SHA 分开报告；不能把 `git rev-parse HEAD` 当成正在运行的应用镜像版本。

## 4. 后续修复

先根据报告核对根域的实际 vhost、证书绑定和跳转规则，再准备明确的修改差异。证书申请、绑定和续期通过服务器安装版本支持的 1Panel 管理方式处理；本工具不自动升级面板、不修改面板数据库，也不直接覆盖其生成文件。

当前只读工具不会修复 GSC 的收录状态。技术验收通过后，继续使用 GSC 单页索引结果与实时渲染结果判断规范网址选择及抓取情况。

## 本地验证

```bash
python3 -m unittest discover -s scripts -p 'test_seo_*.py'
python3 scripts/seo-diagnostics.py --mode public --report diagnostics/public.json --summary diagnostics/public.md
```

公网命令只发起只读 HTTP 请求。服务器模式通过 SSH 标准输入运行同一脚本，不需要先在服务器拉代码或创建脚本文件。

参考：[GitHub Secrets](https://docs.github.com/en/actions/concepts/security/secrets)、[手动运行 Actions](https://docs.github.com/actions/managing-workflow-runs/manually-running-a-workflow)、[1Panel CLI](https://1panel.pro/docs/v2/installation/cli/)。
