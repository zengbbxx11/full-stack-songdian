# 开发数据库快照

本目录中的 `.sql` 和 `.csv` 只用于本地调试、数据结构对照或受控的数据迁移开发，不是生产初始化源。

## 使用边界

- 禁止将本目录快照直接导入生产数据库。
- 生产环境通过独立 Compose `migrate` profile 执行 `aerich upgrade` 创建或升级结构。
- 首次初始化只允许使用最小种子创建角色、权限和初始管理员。
- 现有产品、新闻、分类、询盘、审计和上传记录必须通过受控备份恢复或专用业务迁移保留。
- 已有业务库不得重放已记录迁移、删除数据卷、重建 schema，或用本目录内容覆盖。
- 如果仓库需要公开发布，应单独评估历史快照中的敏感数据并制定 Git 历史清理方案。

## 当前生产基线

- 当前 Aerich 迁移链为 `0`–`15`。
- 11 号迁移增加询盘归因字段和 `t_notification_read_state`。
- 12 号迁移增加产品/新闻发布状态、`published_at` 和 `t_content_revision`。
- 13、14 号迁移规范公开文案。
- 15 号迁移增加产品和新闻的 `sort_order`。
- 生产数据库使用 PostgreSQL 18；未安装 `zhparser` 时，中文全文检索由应用降级为 `simple` 配置。
- 生产产品、新闻、询盘和上传媒体以服务器数据卷及备份为准，不长期跟随 Git。

迁移、初始化、备份与恢复的实际流程以根目录 [CURRENT_IMPLEMENTATION.md](../CURRENT_IMPLEMENTATION.md) 和 [deploy-guide.md](../deploy-guide.md) 为准。
