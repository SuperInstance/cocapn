"""Tests for cocapn.deadband — Deadband protocol."""
from cocapn.deadband import Deadband, DeadbandCheck


class TestDeadbandCheck:
    def test_passed_check(self):
        c = DeadbandCheck(passed=True, violations=[], safe_channel="math")
        assert c.passed is True
        assert c.violations == []
        assert c.safe_channel == "math"

    def test_failed_check(self):
        c = DeadbandCheck(passed=False, violations=["rm -rf"])
        assert c.passed is False
        assert len(c.violations) == 1


class TestDeadband:
    def test_all_dangerous_patterns(self):
        db = Deadband()
        dangerous_inputs = [
            "rm -rf /",
            "DROP TABLE users",
            "DELETE FROM accounts",
            "chmod 777 /etc/passwd",
            "eval(user_input)",
            "sudo rm -rf /var",
            "__import__('os')",
            "os.system('ls')",
            "subprocess.call(['rm'])",
            ">/dev/sda",
            "mkfs.ext4 /dev/sda1",
            "dd if=/dev/zero of=/dev/sda",
        ]
        for inp in dangerous_inputs:
            check = db.check(inp)
            assert not check.passed, f"Should block: {inp}"

    def test_safe_inputs(self):
        db = Deadband()
        safe_inputs = [
            "What is 2+2?",
            "Explain machine learning",
            "Write a Python function",
            "How does sorting work?",
        ]
        for inp in safe_inputs:
            check = db.check(inp)
            assert check.passed, f"Should allow: {inp}"

    def test_channel_detection_math(self):
        db = Deadband()
        check = db.check("Help with math homework")
        assert check.passed
        assert check.safe_channel == "math"

    def test_channel_detection_search(self):
        db = Deadband()
        check = db.check("search for Python docs")
        assert check.passed
        assert check.safe_channel == "search"

    def test_channel_detection_analysis(self):
        db = Deadband()
        check = db.check("do some analysis on this data")
        assert check.passed
        assert check.safe_channel == "analysis"

    def test_channel_detection_safety(self):
        db = Deadband()
        check = db.check("check safety of this code")
        assert check.passed
        assert check.safe_channel == "safety"

    def test_channel_detection_code(self):
        db = Deadband()
        check = db.check("write some code")
        assert check.passed
        assert check.safe_channel == "code"

    def test_channel_detection_explain(self):
        db = Deadband()
        check = db.check("explain this concept")
        assert check.passed
        assert check.safe_channel == "explain"

    def test_channel_detection_navigate(self):
        db = Deadband()
        check = db.check("how to navigate this system")
        assert check.passed
        assert check.safe_channel == "navigate"

    def test_channel_default_general(self):
        db = Deadband()
        check = db.check("hello there")
        assert check.passed
        assert check.safe_channel == "general"

    def test_channel_picks_highest_score(self):
        db = Deadband()
        # "safety" (0.95) > "code" (0.7)
        check = db.check("code safety review")
        assert check.safe_channel == "safety"

    def test_filter_response_removes_danger(self):
        db = Deadband()
        filtered = db.filter_response("Run rm -rf / to clean up")
        assert "[BLOCKED_BY_DEADBAND]" in filtered
        assert "rm -rf" not in filtered

    def test_filter_response_clean_passthrough(self):
        db = Deadband()
        filtered = db.filter_response("This is a safe response")
        assert filtered == "This is a safe response"

    def test_filter_response_multiple_patterns(self):
        db = Deadband()
        filtered = db.filter_response("Use eval(x) and os.system('bad')")
        assert filtered.count("[BLOCKED_BY_DEADBAND]") >= 2
