import json
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]


class PackageContractTests(unittest.TestCase):
    def test_makefile_has_only_native_runtime_dependencies(self):
        text = (ROOT / "Makefile").read_text()
        self.assertIn("+luci-base", text)
        self.assertIn("+firewall4", text)
        for forbidden in ("+bash", "+conntrack", "+iptables", "+nftables", "+bc"):
            self.assertNotIn(forbidden, text)

    def test_project_has_no_daemon_or_custom_nft_program(self):
        forbidden = [
            ROOT / "root/etc/init.d",
            ROOT / "root/usr/bin",
            ROOT / "root/etc/nftables.d",
        ]
        self.assertTrue(all(not path.exists() for path in forbidden))
        production_roots = [ROOT / "Makefile", ROOT / "htdocs", ROOT / "root"]
        source_files = []
        for path in production_roots:
            if path.is_file():
                source_files.append(path)
            elif path.is_dir():
                source_files.extend(p for p in path.rglob("*") if p.is_file())
        sources = "\n".join(p.read_text(errors="ignore") for p in source_files)
        for token in ("timecontrolctrl", "iptables -", "nft add table", "sleep 60"):
            self.assertNotIn(token, sources)

    def test_menu_and_acl_are_minimal(self):
        menu = json.loads((ROOT / "root/usr/share/luci/menu.d/luci-app-timecontrol-native.json").read_text())
        self.assertIn("admin/control", menu)
        self.assertEqual(menu["admin/control/timecontrol-native"]["action"]["path"], "timecontrol-native/rules")
        acl = json.loads((ROOT / "root/usr/share/rpcd/acl.d/luci-app-timecontrol-native.json").read_text())
        grant = acl["luci-app-timecontrol-native"]
        self.assertEqual(grant["read"]["uci"], ["firewall"])
        self.assertEqual(grant["read"]["ubus"], {"network.interface": ["dump"]})
        self.assertEqual(grant["write"]["uci"], ["firewall"])
        self.assertNotIn("file", grant.get("write", {}))

    def test_readme_uses_verified_build_and_migration_commands(self):
        readme = (ROOT / "README.md").read_text()
        self.assertNotIn("luci-app-timecontrol-native_*.apk", readme)
        self.assertIn("make -C feeds/luci/modules/luci-base/src clean po2lmo jsmin", readme)
        for option in ("--dry-run", "--apply", "--rollback"):
            self.assertIn(option, readme)

    def test_readme_documents_mac_only_matching(self):
        readme = (ROOT / "README.md").read_text()
        self.assertNotIn("option src_ip", readme)
        self.assertIn("只写入 `src_mac`", readme)
        self.assertIn("current IP is display-only", readme)

    def test_release_version_is_0_1_3(self):
        makefile = (ROOT / "Makefile").read_text()
        self.assertIn("PKG_VERSION:=0.1.3", makefile)
        self.assertIn("PKG_RELEASE:=1", makefile)

    def test_firewall_reload_is_tracked(self):
        data = json.loads((ROOT / "root/usr/share/ucitrack/luci-app-timecontrol-native.json").read_text())
        self.assertEqual(data, {"config": "firewall", "init": "firewall"})


if __name__ == "__main__":
    unittest.main()
