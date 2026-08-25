"""验证 Aerich 迁移文件中的模型状态元数据可被正常读取。"""

from __future__ import annotations

import ast
from pathlib import Path

import pytest
from aerich.utils import decompress_dict


MIGRATIONS_DIR = Path(__file__).parents[1] / "migrations" / "models"
MIGRATION_FILES = sorted(MIGRATIONS_DIR.glob("[0-9]*_*.py"))


@pytest.mark.parametrize("migration_path", MIGRATION_FILES, ids=lambda path: path.name)
def test_models_state_is_valid_for_aerich(migration_path: Path) -> None:
    """非空快照必须可解码；空快照由 Aerich 根据当前 ORM 模型生成。"""

    module = ast.parse(migration_path.read_text(encoding="utf-8"), filename=str(migration_path))
    assignments = [
        node
        for node in module.body
        if isinstance(node, (ast.Assign, ast.AnnAssign))
        and (
            any(isinstance(target, ast.Name) and target.id == "MODELS_STATE" for target in node.targets)
            if isinstance(node, ast.Assign)
            else isinstance(node.target, ast.Name) and node.target.id == "MODELS_STATE"
        )
    ]

    assert len(assignments) == 1, f"{migration_path.name} 必须定义一次 MODELS_STATE"
    state = ast.literal_eval(assignments[0].value)
    assert isinstance(state, str), f"{migration_path.name} 的 MODELS_STATE 必须是字符串"

    if not state:
        return

    try:
        decoded_state = decompress_dict(state)
    except Exception as exc:  # Aerich 可能抛出 binascii/zlib/JSON 等底层异常
        pytest.fail(f"{migration_path.name} 的 MODELS_STATE 无法被 Aerich 解码: {exc}")

    assert isinstance(decoded_state, dict), f"{migration_path.name} 解码后必须是模型状态字典"
