"""图片上传模块（T03，M6）。

- ``models``：上传记录溯源（UploadRecord）。
- ``services``：存储抽象 ``StorageBackend`` + 本地磁盘实现 ``LocalStorageBackend``。
- ``routers``：``/api/v1/admin/upload``（单/批量）。
"""
