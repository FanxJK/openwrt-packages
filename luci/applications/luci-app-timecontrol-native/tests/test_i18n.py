import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VIEW = (ROOT / "htdocs/luci-static/resources/view/timecontrol-native/rules.js").read_text()
PO = (ROOT / "po/zh_Hans/timecontrol-native.po").read_text()
MENU = json.loads((ROOT / "root/usr/share/luci/menu.d/luci-app-timecontrol-native.json").read_text())


class I18nContractTests(unittest.TestCase):
    def test_every_visible_english_string_has_a_chinese_translation(self):
        source_strings = set(re.findall(r"_\('((?:\\.|[^'])*)'\)", VIEW))
        translated = set(re.findall(r'^msgid "(.*)"$', PO, re.MULTILINE))
        missing = sorted(source_strings - translated)
        self.assertEqual(missing, [], "missing zh_Hans msgids: %s" % missing)

    def test_translatable_source_strings_have_no_edge_whitespace(self):
        source_strings = set(re.findall(r"_\('((?:\\.|[^'])*)'\)", VIEW))
        self.assertEqual([s for s in source_strings if s != s.strip()], [])

    def test_menu_titles_have_chinese_translations(self):
        translated = set(re.findall(r'^msgid "(.*)"$', PO, re.MULTILINE))
        titles = {node["title"] for node in MENU.values()}
        self.assertEqual(sorted(titles - translated), [])

    def test_chinese_build_translates_user_guidance(self):
        sentence = "A range such as 22:00–07:00 crosses midnight natively. Empty weekdays means every day."
        self.assertIn('msgid "%s"' % sentence, PO)
        self.assertIn('msgstr "例如 22:00–07:00 会由 nftables 原生按跨午夜时段处理；未选择星期表示每天。"', PO)

    def test_technical_terms_remain_in_english(self):
        for term in ("firewall4", "nftables", "IP", "MAC", "conntrack"):
            self.assertIn(term, PO)

    def test_base_javascript_contains_no_hard_coded_chinese(self):
        self.assertIsNone(re.search(r"[\u4e00-\u9fff]", VIEW))


if __name__ == "__main__":
    unittest.main()
