"""clean_html / clean_text 白名单测试。

背景（2026-09-18）：后台新闻正文新增「HTML 源码」模式，运营可直接粘贴完整 HTML。
del / figure / figcaption / mark / s / small 被纳入 ALLOWED_TAGS（前台渲染白名单
frontend/lib/html-cleaner.ts 本就允许这几类，此前只在入库时被剥掉），
因此需要固定住「语义标签保留」与「危险内容仍被清除」两侧行为。
"""
from __future__ import annotations

from common.html_cleaner import clean_html, clean_text


def test_semantic_tags_survive_paste():
    """粘贴的图注/删除线/强调等语义标签与图片宽高应完整保留。"""
    html = (
        '<figure><img src="/uploads/a.webp" alt="A" width="1200" height="800">'
        "<figcaption>图注</figcaption></figure>"
        "<p>价格 <s>1999</s> <del>1899</del> <mark>现货</mark> <small>含税</small></p>"
    )
    cleaned = clean_html(html)
    for tag in ("figure", "figcaption", "img", "s", "del", "mark", "small"):
        assert f"<{tag}" in cleaned, (tag, cleaned)
    assert 'alt="A"' in cleaned
    assert 'width="1200"' in cleaned and 'height="800"' in cleaned
    assert "图注" in cleaned


def test_dangerous_markup_is_still_removed():
    """script/style/iframe/事件属性/javascript: 协议必须继续被清除。"""
    html = (
        '<p onclick="alert(1)">正文</p>'
        "<script>alert(1)</script>"
        "<style>body{display:none}</style>"
        '<a href="javascript:alert(1)">x</a>'
        '<img src="javascript:alert(1)">'
        '<iframe src="https://evil.example"></iframe>'
    )
    cleaned = clean_html(html)
    assert "<script" not in cleaned and "</script>" not in cleaned
    assert "<style" not in cleaned
    assert "onclick" not in cleaned
    assert "javascript:" not in cleaned
    assert "<iframe" not in cleaned
    # 被剥离标签的纯文本内容保留（bleach strip=True 的既定行为）
    assert "正文" in cleaned


def test_inline_style_and_unknown_attrs_are_stripped():
    """内联 style 与非白名单属性继续被剥离；class 保留（前台排版依赖）。"""
    cleaned = clean_html('<p style="color:red" data-x="1" class="lead">文字</p>')
    assert "style=" not in cleaned
    assert "data-x" not in cleaned
    assert 'class="lead"' in cleaned
    assert "文字" in cleaned


def test_new_semantic_tags_reject_style_and_events():
    """新增的语义标签同样不允许 style/on* 与危险协议（属性白名单统一拦截）。"""
    cleaned = clean_html(
        '<figure style="background:url(javascript:1)" onclick="alert(1)">'
        '<img src="data:text/html,<script>alert(1)</script>" alt="x">'
        '<figcaption onmouseover="alert(1)">图注</figcaption></figure>'
        '<mark style="position:fixed">高亮</mark>'
    )
    assert "style=" not in cleaned
    assert "onclick" not in cleaned and "onmouseover" not in cleaned
    assert "javascript:" not in cleaned
    assert "data:text/html" not in cleaned
    assert "图注" in cleaned and "高亮" in cleaned


def test_tel_protocol_is_allowed():
    """tel: 与前台渲染白名单对齐（源码模式粘贴的电话链接不再被剥掉 href）。"""
    cleaned = clean_html('<a href="tel:+8675512345678">致电</a>')
    assert 'href="tel:+8675512345678"' in cleaned


def test_clean_text_strips_all_tags():
    """纯文本字段（标题/摘要）仍在入库前剥离所有标签。"""
    assert clean_text("<b>标题</b>") == "标题"
    assert clean_text(None) == ""
