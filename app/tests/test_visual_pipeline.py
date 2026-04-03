from app.visual_pipeline import _summarize_chart_from_ocr


def test_summarize_chart_from_ocr_detects_increasing_trend():
    lines = [
        "Revenue Trend",
        "2020 100",
        "2021 140",
        "2022 180",
    ]

    summary, structured, confidence, error_reason = _summarize_chart_from_ocr(lines)

    assert error_reason is None
    assert summary is not None
    assert structured is not None
    assert structured["trend_direction"] == "increasing"
    assert structured["chart_type"] == "bar_or_line"
    assert confidence >= 0.7


def test_summarize_chart_from_ocr_flags_low_signal_input():
    lines = [
        "Logo",
        "Confidential",
    ]

    summary, structured, confidence, error_reason = _summarize_chart_from_ocr(lines)

    assert summary is None
    assert structured is None
    assert confidence == 0.0
    assert error_reason is not None
