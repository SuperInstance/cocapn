"""Tests for cocapn.agent — CocapnAgent (offline, no API calls)."""
import json
import os
import tempfile

from cocapn.agent import CocapnAgent, SYSTEM_PROMPT


class TestCocapnAgent:
    def test_init_defaults(self):
        with tempfile.TemporaryDirectory() as tmp:
            agent = CocapnAgent(data_dir=tmp)
            assert agent.model == "kimi-k2.5"
            assert agent.base_url == "https://api.moonshot.ai/v1"
            assert agent.api_key in ("", None)
            assert agent.name == "cocapn"
            assert agent.system_prompt == SYSTEM_PROMPT
            assert agent._exchange_count == 0
            assert agent.conversation == []

    def test_init_custom_params(self):
        with tempfile.TemporaryDirectory() as tmp:
            agent = CocapnAgent(
                api_key="test-key",
                model="custom-model",
                base_url="https://custom.api/v1",
                data_dir=tmp,
            )
            assert agent.api_key == "test-key"
            assert agent.model == "custom-model"
            assert agent.base_url == "https://custom.api/v1"

    def test_load_config_from_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            cfg_path = os.path.join(tmp, "config.yaml")
            with open(cfg_path, "w") as f:
                f.write("agent:\n  name: testbot\n  model: test-model\n  api_key: cfgkey\n")
            agent = CocapnAgent(data_dir=tmp, config_path=cfg_path)
            assert agent.name == "testbot"
            assert agent.model == "test-model"
            assert agent.api_key == "cfgkey"

    def test_load_config_missing_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            agent = CocapnAgent(data_dir=tmp, config_path="/nonexistent/config.yaml")
            assert agent.name == "cocapn"  # default

    def test_env_api_key_fallback(self):
        with tempfile.TemporaryDirectory() as tmp:
            os.environ["MOONSHOT_API_KEY"] = "env-key"
            try:
                agent = CocapnAgent(data_dir=tmp)
                assert agent.api_key == "env-key"
            finally:
                del os.environ["MOONSHOT_API_KEY"]

    def test_build_messages_basic(self):
        with tempfile.TemporaryDirectory() as tmp:
            agent = CocapnAgent(data_dir=tmp)
            msgs = agent._build_messages("Hello")
            assert msgs[0]["role"] == "system"
            assert msgs[0]["content"] == SYSTEM_PROMPT
            assert msgs[-1]["role"] == "user"
            assert msgs[-1]["content"] == "Hello"

    def test_build_messages_includes_context(self):
        with tempfile.TemporaryDirectory() as tmp:
            agent = CocapnAgent(data_dir=tmp)
            agent.flywheel.record_exchange("What is Rust?", "A systems language", room="general", confidence=0.9)
            msgs = agent._build_messages("Tell me about Rust")
            # Should have at least: system prompt, context system msg, user msg
            assert len(msgs) >= 3
            context_msgs = [m for m in msgs if "Relevant knowledge" in m.get("content", "")]
            assert len(context_msgs) >= 1

    def test_build_messages_includes_conversation(self):
        with tempfile.TemporaryDirectory() as tmp:
            agent = CocapnAgent(data_dir=tmp)
            agent.conversation = [
                {"role": "user", "content": "hi"},
                {"role": "assistant", "content": "hello"},
            ]
            msgs = agent._build_messages("new question")
            # system + conversation + new user
            assert any(m["content"] == "hi" for m in msgs)
            assert msgs[-1]["content"] == "new question"

    def test_teach(self):
        with tempfile.TemporaryDirectory() as tmp:
            agent = CocapnAgent(data_dir=tmp)
            result = agent.teach("What is X?", "X is Y")
            assert "Learned" in result
            assert agent.flywheel.store.count == 1

    def test_teach_custom_room(self):
        with tempfile.TemporaryDirectory() as tmp:
            agent = CocapnAgent(data_dir=tmp)
            agent.teach("q", "a", room="custom", confidence=0.95)
            assert "custom" in agent.flywheel.rooms

    def test_status(self):
        with tempfile.TemporaryDirectory() as tmp:
            agent = CocapnAgent(data_dir=tmp)
            agent.teach("q1", "a1", room="r1")
            status = agent.status()
            assert "cocapn" in status
            assert "Exchanges: 0" in status
            assert "Tiles: 1" in status

    def test_save(self):
        with tempfile.TemporaryDirectory() as tmp:
            agent = CocapnAgent(data_dir=tmp)
            agent.teach("q", "a")
            agent.save()
            # Verify persistence by loading flywheel
            from cocapn.flywheel import Flywheel
            fw2 = Flywheel(data_dir=tmp)
            assert fw2.store.count == 1

    def test_deadband_integration(self):
        """Deadband is wired into agent (tested more in test_deadband)."""
        with tempfile.TemporaryDirectory() as tmp:
            agent = CocapnAgent(data_dir=tmp)
            assert agent.deadband is not None
            check = agent.deadband.check("rm -rf /")
            assert not check.passed
