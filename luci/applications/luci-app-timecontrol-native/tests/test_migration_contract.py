import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "root/usr/sbin/timecontrol-native-migrate"


class MigrationContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.text = SCRIPT.read_text()

    def test_is_explicit_and_reversible(self):
        self.assertIn("--dry-run", self.text)
        self.assertIn("--apply", self.text)
        self.assertIn("--rollback", self.text)
        self.assertIn("firewall.before-timecontrol-native-migration", self.text)

    def test_refuses_unsupported_duration_modes(self):
        self.assertIn("Only legacy period mode can be migrated", self.text)
        self.assertIn("time_mode", self.text)

    def test_migrates_only_stable_mac_targets(self):
        self.assertIn("requires a MAC target", self.text)
        self.assertIn("Legacy %d", self.text)
        self.assertNotIn("Legacy %d (IP)", self.text)
        self.assertNotIn("split into two firewall4 rules", self.text)

    def test_only_writes_standard_firewall4_options(self):
        for option in ("src", "dest", "src_mac", "start_time", "stop_time", "target", "family"):
            self.assertIn(".%s" % option, self.text)
        self.assertNotIn(".src_ip", self.text)
        for forbidden in ("iptables", "ip6tables", "nft add", "sleep 60", "timecontrolctrl"):
            self.assertNotIn(forbidden, self.text)

    def test_checks_before_reload(self):
        self.assertLess(self.text.index('"$FW4_BIN" check'), self.text.index('"$FIREWALL_INIT" reload'))


if __name__ == "__main__":
    unittest.main()
