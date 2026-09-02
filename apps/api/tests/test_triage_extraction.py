"""Unit tests for extract_relevant_policy_sections.

The function selects which policy clauses are included in every Gemini
triage prompt and image-analysis context, so its keyword matching,
line capping, and truncation fallback directly shape AI output quality.
"""
from __future__ import annotations

from services.triage_service import extract_relevant_policy_sections


def test_empty_text_returns_placeholder():
    assert extract_relevant_policy_sections("", "own_damage") == "No policy text available."
    assert extract_relevant_policy_sections(None, "theft") == "No policy text available."


def test_keeps_lines_matching_generic_keywords():
    text = (
        "Intro paragraph about the parties.\n"
        "This section defines the coverage limit.\n"
        "A liability clause follows here.\n"
        "Nothing about insurance in this line.\n"
    )
    result = extract_relevant_policy_sections(text, "own_damage")
    assert "coverage limit" in result
    assert "liability clause" in result
    assert "Intro paragraph about the parties." not in result
    assert result.count("\n") == 1  # exactly the two matching lines


def test_claim_type_specific_keywords_are_included():
    filler = "Plain introductory text follows.\n"
    assert "collision" in extract_relevant_policy_sections(
        filler + "Our collision coverage applies.\n", "own_damage"
    )
    assert "third party" in extract_relevant_policy_sections(
        filler + "Third party liability for injury.\n", "third_party"
    ).lower()
    assert "theft" in extract_relevant_policy_sections(
        filler + "Theft of the parked vehicle is covered.\n", "theft"
    ).lower()
    assert "flood" in extract_relevant_policy_sections(
        filler + "Flood damage clause.\n", "natural_calamity"
    ).lower()
    assert "explosion" in extract_relevant_policy_sections(
        filler + "Explosion coverage.\n", "fire"
    ).lower()


def test_unrelated_claim_type_keywords_are_excluded():
    text = "A coverage statement.\nstolen vehicle scenario.\n"
    result = extract_relevant_policy_sections(text, "own_damage")
    assert result == "A coverage statement."
    assert "stolen" not in result


def test_claim_type_is_case_insensitive():
    text = "Accidental bumper damage is covered.\n"
    assert extract_relevant_policy_sections(text, "OWN_DAMAGE") == text.strip()


def test_caps_relevant_lines():
    lines = [f"Section {i}: coverage terms." for i in range(50)]
    result = extract_relevant_policy_sections("\n".join(lines), "own_damage")
    assert len(result.split("\n")) == 41


def test_falls_back_to_truncated_text_when_no_keywords():
    text = "plain prose about insurance matters " * 600  # no keyword vocabulary
    assert len(text) > 4000
    result = extract_relevant_policy_sections(text, "own_damage")
    assert result == text[:4000]
