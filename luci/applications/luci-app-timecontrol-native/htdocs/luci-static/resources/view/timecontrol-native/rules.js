'use strict';
'require view';
'require uci';
'require form';
'require rpc';
'require dom';
'require timecontrol-native.model as tcmodel';

var callHostHints = rpc.declare({
	object: 'luci-rpc',
	method: 'getHostHints',
	expect: { '': {} }
});

var callNetworkInterfaces = rpc.declare({
	object: 'network.interface',
	method: 'dump',
	expect: { '': {} }
});

var dayLabels = {
	allDay: _('All day'),
	everyday: _('Every day'),
	weekdays: _('Weekdays'),
	weekend: _('Weekend'),
	overnight: _('next day'),
	Mon: _('Mon'), Tue: _('Tue'), Wed: _('Wed'), Thu: _('Thu'),
	Fri: _('Fri'), Sat: _('Sat'), Sun: _('Sun')
};

function buildDeviceChoices(hosts, knownNames) {
	var seen = {};
	var choices = { keys: [], labels: {} };
	Object.keys(hosts || {}).sort().forEach(function(mac) {
		var host = hosts[mac] || {};
		var name = host.name || knownNames[mac] || knownNames[mac.toLowerCase()] || _('Unknown device');
		var ips = L.toArray(host.ipaddrs).filter(Boolean);
		if (!ips.length)
			return;
		seen[mac.toLowerCase()] = true;
		choices.keys.push(mac);
		choices.labels[mac] = '%s — %s — %s'.format(name, ips.join(', '), mac);
	});
	Object.keys(knownNames).sort().forEach(function(mac) {
		if (!seen[mac.toLowerCase()] && knownNames[mac]) {
			choices.keys.push(mac);
			choices.labels[mac] = '%s — %s — %s'.format(knownNames[mac], _('No current IP'), mac);
		}
	});
	return choices;
}

function addDeviceChoices(option, choices) {
	option.keylist = [];
	option.vallist = [];
	choices.keys.forEach(function(mac) {
		option.value(mac, choices.labels[mac]);
	});
}

function injectStyle() {
	if (document.getElementById('tcn-style'))
		return;
	var style = document.createElement('style');
	style.id = 'tcn-style';
	style.textContent = `
		.tcn-page{--tcn-accent:#4f7cff;--tcn-cyan:#20c6d7;--tcn-ok:#24b47e;--tcn-muted:var(--text-color-medium,#718096)}
		.tcn-hero{position:relative;isolation:isolate;overflow:hidden;padding:26px;margin:0 0 18px;border:1px solid rgba(94,106,210,.20);border-radius:18px;background:linear-gradient(135deg,rgba(94,106,210,.10),rgba(127,127,127,.035) 58%,rgba(32,198,215,.06));box-shadow:0 14px 34px rgba(15,23,42,.08)}
		.tcn-hero>*{position:relative;z-index:1}
		.tcn-hero:after{content:"";position:absolute;z-index:0;width:240px;height:240px;right:-105px;top:-135px;border-radius:50%;background:radial-gradient(circle,rgba(94,106,210,.20),transparent 68%)}
		.tcn-eyebrow{display:inline-flex;align-items:center;width:max-content;padding:6px 10px;border:1px solid rgba(255,255,255,.18);border-radius:999px;background:linear-gradient(135deg,#465ccf,#5e6ad2);box-shadow:0 6px 16px rgba(70,92,207,.20);font-size:10px;font-weight:800;line-height:1;letter-spacing:.14em;color:#fff;text-transform:uppercase}
		.tcn-hero h2{height:auto!important;margin:7px 0 7px!important;padding:0!important;border:0!important;background:transparent!important;font-size:26px!important;line-height:1.2!important;color:inherit!important}
		.tcn-hero p{max-width:760px;margin:0;color:var(--tcn-muted);line-height:1.65}
		.tcn-badges{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px}
		.tcn-badge{display:inline-flex;align-items:center;gap:7px;padding:7px 11px;border-radius:999px;background:rgba(127,127,127,.10);font-size:12px;font-weight:700}
		.tcn-badge.ok:before{content:"";width:8px;height:8px;border-radius:50%;background:var(--tcn-ok);box-shadow:0 0 0 4px rgba(36,180,126,.14)}
		.tcn-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-bottom:18px}
		.tcn-card{padding:15px 16px;border:1px solid rgba(127,127,127,.16);border-radius:14px;background:rgba(127,127,127,.045)}
		.tcn-card strong{display:block;margin-bottom:5px;font-size:14px}.tcn-card span{font-size:12px;line-height:1.55;color:var(--tcn-muted)}
		.tcn-notice{margin:0 0 18px;padding:13px 15px;border-left:4px solid #d69e2e;border-radius:9px;background:rgba(214,158,46,.10);line-height:1.55;font-size:13px}
		.tcn-page .cbi-map{padding:0}.tcn-page .cbi-map > h2,.tcn-page .cbi-map > .cbi-map-descr{display:none}
		.tcn-page .cbi-section{border-radius:14px;overflow:hidden}.tcn-page .cbi-section h3{height:auto!important;background:transparent!important}
		.tcn-page .cbi-section-table{table-layout:fixed}.tcn-page .cbi-section-table th,.tcn-page .cbi-section-table td{overflow-wrap:anywhere}
		@media(max-width:760px){.tcn-hero{padding:19px 17px;border-radius:14px}.tcn-hero h2{font-size:22px!important}.tcn-grid{grid-template-columns:1fr}.tcn-page .cbi-section-table{display:block}.tcn-page .cbi-section-table thead{display:none}.tcn-page .cbi-section-table tbody,.tcn-page .cbi-section-table tr{display:block}.tcn-page .cbi-section-table tr{margin:10px;border:1px solid rgba(127,127,127,.16);border-radius:12px;padding:8px;background:rgba(127,127,127,.035)}.tcn-page .cbi-section-table td{display:grid!important;grid-template-columns:105px minmax(0,1fr);width:auto!important;padding:7px!important;border:0!important}.tcn-page .cbi-section-table td:before{content:attr(data-title);font-size:11px;font-weight:800;color:var(--tcn-muted)}.tcn-page .cbi-section-actions{display:flex!important;justify-content:flex-end!important}.tcn-page .cbi-section-actions:before{display:none}.modal .cbi-value[data-name="src_mac"] .cbi-value-field{width:100%!important;max-width:none!important}.modal .cbi-value[data-name="src_mac"] .cbi-dropdown{width:100%!important;max-width:none!important}}
	`;
	document.head.appendChild(style);
}

return view.extend({
	load: function() {
		return Promise.all([
			callHostHints(),
			callNetworkInterfaces(),
			uci.load('firewall')
		]);
	},

	render: function(data) {
		injectStyle();
		var hosts = data[0] || {};
		var runtimeInterfaces = (data[1] && data[1].interface) || [];
		var zones = uci.sections('firewall', 'zone');
		var managed = uci.sections('firewall', 'rule').filter(function(rule) {
			return tcmodel.isManaged(rule.name);
		});
		var enabled = managed.filter(function(rule) { return rule.enabled !== '0'; }).length;
		var m = new form.Map('firewall', _('Native Time Control'));
		var s, o;

		s = m.section(form.GridSection, 'rule', _('Device rules'),
			_('Each item is a normal firewall4 traffic rule. Saving reloads firewall4 atomically.'));
		s.anonymous = true;
		s.addremove = true;
		s.sortable = false;
		s.addbtntitle = _('Add device rule');
		s.filter = function(section_id) {
			return tcmodel.isManaged(uci.get('firewall', section_id, 'name'));
		};
		s.sectiontitle = function(section_id) {
			return tcmodel.displayName(uci.get('firewall', section_id, 'name')) || _('New device rule');
		};

		o = s.option(form.Flag, 'enabled', _('Enabled'));
		o.default = '1';
		o.editable = true;
		o.width = '7%';

		var deviceOption;
		var sourceOption = s.option(form.ListValue, 'src', _('Source zone'));
		sourceOption.modalonly = true;
		sourceOption.rmempty = false;
		sourceOption.default = 'lan';
		zones.forEach(function(zone) { if (zone.name) sourceOption.value(zone.name, zone.name); });

		function sourceZoneForSection(option, section_id) {
			return option.section.formvalue(section_id, 'src') ||
				uci.get('firewall', section_id, 'src') || 'lan';
		}

		function knownNamesForSection(section_id) {
			var names = {};
			var savedMac = uci.get('firewall', section_id, 'src_mac');
			var savedName = tcmodel.displayName(uci.get('firewall', section_id, 'name'));
			if (savedMac && savedName)
				names[String(savedMac)] = savedName;
			return names;
		}

		function choicesForSection(section_id, sourceZone) {
			var zoneHosts = tcmodel.hostsForZone(hosts, zones, runtimeInterfaces, sourceZone);
			return buildDeviceChoices(zoneHosts, knownNamesForSection(section_id));
		}

		function validateSchedule(option, section_id) {
			var allDay = option.section.formvalue(section_id, '_all_day');
			var start = option.section.formvalue(section_id, 'start_time');
			var stop = option.section.formvalue(section_id, 'stop_time');
			var weekdays = option.section.formvalue(section_id, 'weekdays');
			if (allDay === '1' || (!start && !stop))
				return true;
			if (!tcmodel.isValidTimeRange(start, stop))
				return _('Start and stop time must be different.');
			if (tcmodel.isOvernightTimeRange(start, stop) && tcmodel.hasSpecificWeekdays(weekdays))
				return _('Overnight ranges require every day. Clear weekdays or use a same-day range.');
			return true;
		}

		sourceOption.onchange = function(ev, section_id, value) {
			var choices = choicesForSection(section_id, value);
			var widgetNode = document.querySelector('.modal .cbi-value[data-name="src_mac"] .cbi-dropdown');
			var modalDeviceOption = this.section.getOption('src_mac');
			var widget = widgetNode ? dom.findClassInstance(widgetNode) :
				(modalDeviceOption ? modalDeviceOption.getUIElement(section_id) : null);
			if (widget) {
				widget.clearChoices(true);
				widget.addChoices(choices.keys, choices.labels);
			}
		};

		deviceOption = s.option(form.Value, 'src_mac', _('Device information'));
		deviceOption.rmempty = false;
		deviceOption.datatype = 'macaddr';
		deviceOption.forcewrite = true;
		deviceOption.width = '58%';
		deviceOption.description = _('Only devices with a current IPv4 address in the selected source zone are shown. The IP is for reference and is not used for matching.');
		deviceOption.renderWidget = function(section_id, option_index, cfgvalue) {
			var choices = choicesForSection(section_id, sourceZoneForSection(this, section_id));
			addDeviceChoices(this, choices);
			return form.Value.prototype.renderWidget.apply(this, arguments);
		};
		deviceOption.validate = function(section_id, value) {
			var sourceZone = sourceZoneForSection(this, section_id);
			var zoneHosts = tcmodel.hostsForZone(hosts, zones, runtimeInterfaces, sourceZone);
			var device = tcmodel.deviceForMac(zoneHosts, value);
			var savedMac = uci.get('firewall', section_id, 'src_mac');
			return device || String(value).toLowerCase() === String(savedMac || '').toLowerCase() ? true :
				_('Select a device from the selected source zone.');
		};
		deviceOption.write = function(section_id, value) {
			var sourceZone = sourceZoneForSection(this, section_id);
			var zoneHosts = tcmodel.hostsForZone(hosts, zones, runtimeInterfaces, sourceZone);
			var device = tcmodel.deviceForMac(zoneHosts, value);
			var savedMac = uci.get('firewall', section_id, 'src_mac');
			var savedName = uci.get('firewall', section_id, 'name');
			if (device) {
				var name = tcmodel.bindingName(device, savedMac, savedName);
				uci.set('firewall', section_id, 'name', tcmodel.managedName(name));
				uci.set('firewall', section_id, 'src_mac', device.mac);
			}
			else {
				uci.set('firewall', section_id, 'src_mac', value);
			}
			uci.unset('firewall', section_id, 'src_ip');
		};

		o = s.option(form.DummyValue, '_schedule', _('Blocked period'));
		o.width = '23%';
		o.textvalue = function(section_id) {
			return tcmodel.scheduleSummary(
				uci.get('firewall', section_id, 'start_time') || '',
				uci.get('firewall', section_id, 'stop_time') || '',
				uci.get('firewall', section_id, 'weekdays') || '',
				dayLabels
			);
		};
		o.cfgvalue = o.textvalue;

		o = s.option(form.ListValue, 'dest', _('Destination zone'));
		o.modalonly = true;
		o.rmempty = false;
		o.default = 'wan';
		zones.forEach(function(zone) { if (zone.name) o.value(zone.name, zone.name); });

		var weekdaysOption = s.option(form.MultiValue, 'weekdays', _('Week days'));
		weekdaysOption.modalonly = true;
		weekdaysOption.multiple = true;
		weekdaysOption.placeholder = _('Every day');
		[ ['Mon', _('Monday')], ['Tue', _('Tuesday')], ['Wed', _('Wednesday')],
		  ['Thu', _('Thursday')], ['Fri', _('Friday')], ['Sat', _('Saturday')],
		  ['Sun', _('Sunday')] ].forEach(function(day) { weekdaysOption.value(day[0], day[1]); });
		weekdaysOption.cfgvalue = function(section_id) {
			return L.toArray(uci.get('firewall', section_id, 'weekdays'));
		};
		weekdaysOption.write = function(section_id, value) {
			value = L.toArray(value);
			if (value.length)
				uci.set('firewall', section_id, 'weekdays', value.join(' '));
			else
				uci.unset('firewall', section_id, 'weekdays');
		};
		weekdaysOption.validate = function(section_id) {
			return validateSchedule(this, section_id);
		};

		var allDayOption = s.option(form.Flag, '_all_day', _('All day'));
		allDayOption.modalonly = true;
		allDayOption.rmempty = false;
		allDayOption.default = '1';
		allDayOption.forcewrite = true;
		allDayOption.description = _('When enabled, no start or stop time is written and the rule applies for the entire selected day.');
		allDayOption.cfgvalue = function(section_id) {
			return !uci.get('firewall', section_id, 'start_time') &&
				!uci.get('firewall', section_id, 'stop_time') ? '1' : '0';
		};
		allDayOption.write = function(section_id, value) {
			if (value === '1') {
				uci.unset('firewall', section_id, 'start_time');
				uci.unset('firewall', section_id, 'stop_time');
			}
		};

		var startOption = s.option(form.Value, 'start_time', _('Block from'));
		startOption.modalonly = true;
		startOption.rmempty = false;
		startOption.default = '22:00:00';
		startOption.datatype = 'timehhmmss';
		startOption.depends('_all_day', '0');
		startOption.description = _('Overnight ranges are available only when every day is selected.');
		startOption.validate = function(section_id) {
			return validateSchedule(this, section_id);
		};

		var stopOption = s.option(form.Value, 'stop_time', _('Block until'));
		stopOption.modalonly = true;
		stopOption.rmempty = false;
		stopOption.default = '07:00:00';
		stopOption.datatype = 'timehhmmss';
		stopOption.depends('_all_day', '0');
		stopOption.validate = function(section_id) {
			return validateSchedule(this, section_id);
		};

		o = s.option(form.ListValue, 'target', _('Action'));
		o.modalonly = true;
		o.rmempty = false;
		o.default = 'REJECT';
		o.value('REJECT', _('Reject'));
		o.value('DROP', _('Drop'));

		o = s.option(form.HiddenValue, 'proto');
		o.modalonly = true;
		o.default = 'all';
		o.rmempty = false;
		o = s.option(form.HiddenValue, 'family');
		o.modalonly = true;
		o.default = 'any';
		o.rmempty = false;

		var hero = E('div', { 'class': 'tcn-hero' }, [
			E('div', { 'class': 'tcn-eyebrow' }, _('FIREWALL4 NATIVE POLICY')),
			E('h2', {}, _('Native device time control')),
			E('p', {}, _('No daemon, no minute polling and no private nftables table. Rules are stored in /etc/config/firewall and compiled by firewall4 into nftables meta hour and meta day expressions.')),
			E('div', { 'class': 'tcn-badges' }, [
				E('span', { 'class': 'tcn-badge ok' }, _('firewall4 native')),
				E('span', { 'class': 'tcn-badge' }, _('%d rules').format(managed.length)),
				E('span', { 'class': 'tcn-badge' }, _('%d enabled').format(enabled)),
				E('span', { 'class': 'tcn-badge' }, _('0 background processes'))
			])
		]);
		var cards = E('div', { 'class': 'tcn-grid' }, [
			E('div', { 'class': 'tcn-card' }, [ E('strong', {}, _('1. Select a device')), E('span', {}, _('Choose a device by MAC address. Its current IP is displayed for reference only.')) ]),
			E('div', { 'class': 'tcn-card' }, [ E('strong', {}, _('2. Set blocked time')), E('span', {}, _('New rules default to all day. Turn off All day to set a custom range; empty weekdays means every day.')) ]),
			E('div', { 'class': 'tcn-card' }, [ E('strong', {}, _('3. Save and apply')), E('span', {}, _('LuCI writes normal traffic-rule options and asks firewall4 to reload atomically.')) ])
		]);
		var notice = E('div', { 'class': 'tcn-notice' }, [
			E('strong', {}, [ _('Native behavior:'), ' ' ]),
			_('Rules match only the selected MAC address, so DHCP address changes do not affect the policy. Specific weekdays use same-day ranges; overnight ranges require every day. Existing conntrack or flow-offloaded sessions may continue until they reconnect; this app deliberately runs no timer or connection-killing daemon.')
		]);

		return m.render().then(function(mapNode) {
			return E('div', { 'class': 'tcn-page' }, [ hero, cards, notice, mapNode ]);
		});
	}
});
