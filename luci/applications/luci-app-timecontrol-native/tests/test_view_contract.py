import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
VIEW = ROOT / "htdocs/luci-static/resources/view/timecontrol-native/rules.js"


class ViewContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.text = VIEW.read_text()

    def test_edits_firewall_rule_sections_directly(self):
        self.assertIn("new form.Map('firewall'", self.text)
        self.assertIn("form.GridSection, 'rule'", self.text)
        self.assertIn("tcmodel.isManaged", self.text)

    def test_mac_selection_is_the_only_device_identity(self):
        self.assertIn("s.option(form.Value, 'src_mac', _('Device information'))", self.text)
        self.assertIn("datatype = 'macaddr'", self.text)
        self.assertIn("deviceOption.forcewrite = true", self.text)
        self.assertNotIn("s.option(form.Value, 'src_ip'", self.text)
        self.assertNotIn("s.option(form.DummyValue, 'name'", self.text)
        self.assertNotIn("s.option(form.DummyValue, 'src_mac'", self.text)
        self.assertIn("addDeviceChoices", self.text)
        self.assertIn("tcmodel.deviceForMac(zoneHosts, value)", self.text)
        self.assertIn("uci.set('firewall', section_id, 'src_mac', device.mac)", self.text)
        self.assertIn("uci.unset('firewall', section_id, 'src_ip')", self.text)
        self.assertIn("tcmodel.bindingName(device, savedMac, savedName)", self.text)

    def test_mac_selector_uses_mobile_modal_width(self):
        self.assertIn(".modal .cbi-value[data-name=\"src_mac\"] .cbi-value-field{width:100%!important", self.text)
        self.assertIn(".modal .cbi-value[data-name=\"src_mac\"] .cbi-dropdown{width:100%!important", self.text)

    def test_uses_native_time_options(self):
        for option in ("'weekdays'", "'start_time'", "'stop_time'"):
            self.assertIn(option, self.text)
        self.assertNotIn("'utc_time'", self.text)

    def test_new_rules_default_to_all_day_without_time_options(self):
        self.assertIn("s.option(form.Flag, '_all_day', _('All day'))", self.text)
        self.assertIn("allDayOption.default = '1'", self.text)
        self.assertIn("uci.unset('firewall', section_id, 'start_time')", self.text)
        self.assertIn("uci.unset('firewall', section_id, 'stop_time')", self.text)
        self.assertIn("startOption.depends('_all_day', '0')", self.text)
        self.assertIn("stopOption.depends('_all_day', '0')", self.text)

    def test_device_choices_follow_the_source_zone(self):
        self.assertIn("object: 'network.interface'", self.text)
        self.assertIn("tcmodel.hostsForZone(hosts, zones, runtimeInterfaces, sourceZone)", self.text)
        self.assertIn("sourceOption.onchange = function(ev, section_id, value)", self.text)
        self.assertIn("widget.clearChoices(true)", self.text)
        self.assertIn("widget.addChoices(choices.keys, choices.labels)", self.text)

    def test_internal_firewall_defaults_do_not_add_grid_columns(self):
        for option in ("proto", "family"):
            marker = "o = s.option(form.HiddenValue, '%s');\n\t\to.modalonly = true;" % option
            self.assertIn(marker, self.text)

    def test_hero_eyebrow_has_high_contrast_pill(self):
        self.assertIn(".tcn-eyebrow{display:inline-flex", self.text)
        self.assertIn("color:#fff", self.text)
        self.assertIn("background:linear-gradient(135deg,#465ccf,#5e6ad2)", self.text)
        self.assertIn("isolation:isolate", self.text)
        self.assertIn(".tcn-hero>*{position:relative;z-index:1}", self.text)

    def test_schedule_summary_reads_pending_or_saved_values(self):
        self.assertIn("o.cfgvalue = o.textvalue", self.text)

    def test_has_no_polling_or_command_execution(self):
        for forbidden in ("fs.exec", "poll.add", "setInterval", "timecontrolctrl", "iptables", "nft add"):
            self.assertNotIn(forbidden, self.text)


if __name__ == "__main__":
    unittest.main()
