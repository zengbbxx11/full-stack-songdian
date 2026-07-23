# 设计文档索引

Songdian B2B 工厂外贸全栈项目的架构设计文档。

---

## 文档清单

| 文档 | 说明 |
|---|---|
| `design-admin-ui.md` | 后台管理界面系统设计 + 任务分解（Phase 1 T01~T09） |
| `design-product-tags.md` | 产品标签恢复设计（WP tags → `Product.tags` JSONField 全链路） |
| `admin-ui-class-diagram.mermaid` | 后台管理类图（API 契约、模型关系、权限码） |
| `admin-ui-sequence-diagram.mermaid` | 后台管理时序图（登录鉴权流、CRUD 流、图片上传流） |
| `class-diagram-product-tags.mermaid` | 标签恢复类图（WP 适配器、ETL、模型 schema） |
| `sequence-diagram-product-tags.mermaid` | 标签恢复时序图（ETL 拉取 → 适配 → 写入 → 前端消费） |

### 已完成但文档待补充
- **排序管理**：Product/News 已加 `sort_order`，admin 拖拽排序通过 `PUT {sort_order: N}` 持久化，前端 `onError` 兜底缺失图片

---

## 项目顶层 README

详见项目根目录 `../README.md`。
