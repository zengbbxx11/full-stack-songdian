"""Durable outbox; business writes enqueue work in the same transaction."""

from tortoise import Model, fields


class BackgroundJob(Model):
    id = fields.BigIntField(primary_key=True)
    kind = fields.CharField(max_length=30)
    payload = fields.JSONField()
    attempts = fields.IntField(default=0)
    status = fields.CharField(max_length=20, default="PENDING")
    available_at = fields.DatetimeField()
    lease_token = fields.CharField(max_length=64, null=True)
    last_error = fields.CharField(max_length=500, null=True)
    created_time = fields.DatetimeField(auto_now_add=True)

    class Meta:
        table = "t_background_job"
        indexes = (("status", "available_at"),)
