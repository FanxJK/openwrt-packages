'use strict';
'require view';
'require form';
'require uci';
'require rpc';
'require fs';
'require ui';
'require tools.widgets as widgets';

var callHostHints = rpc.declare({
	object: 'luci-rpc',
	method: 'getHostHints',
	expect: { '': {} }
});

function normalize(value) {
	if (value == null)
		return '';

	return String(value).trim();
}

function commandOutput(res) {
	var text = [ res.stdout, res.stderr ].map(normalize).filter(function(value) {
		return value.length > 0;
	}).join('\n');

	return text.length > 1000 ? text.slice(0, 1000) + '...' : text;
}

function hostHintLabel(hint) {
	var parts = [];

	if (hint == null)
		return '';

	if (Array.isArray(hint))
		parts = hint;
	else if (typeof hint === 'object') {
		if (hint.name)
			parts.push(hint.name);
		if (hint.ipv4)
			parts.push(hint.ipv4);
		if (hint.ipaddr)
			parts.push(hint.ipaddr);
		if (Array.isArray(hint.ipaddrs))
			parts = parts.concat(hint.ipaddrs);
	} else {
		parts.push(hint);
	}

	return parts.map(normalize).filter(function(value, index, values) {
		return value.length > 0 && values.indexOf(value) === index;
	}).join(', ');
}

function addHostHints(option, hints) {
	Object.keys(hints || {}).sort().forEach(function(mac) {
		var label = hostHintLabel(hints[mac]);

		option.value(mac, label ? mac + ' (' + label + ')' : mac);
	});
}

function optionChanged(option, sectionId) {
	var current = option.formvalue(sectionId);

	if (current == null)
		current = uci.get('wolplus', sectionId, option.option);

	return normalize(current) !== normalize(uci.get('wolplus', sectionId, option.option));
}

function hasUnsavedValues(options, sectionId) {
	for (var i = 0; i < options.length; i++)
		if (optionChanged(options[i], sectionId))
			return true;

	return false;
}

function isValidMac(value) {
	return /^([0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}$/.test(value);
}

function isValidInterface(value) {
	return value.length > 0 && value.charAt(0) !== '-' && /^[A-Za-z0-9_.:-]+$/.test(value);
}

function notify(message, severity) {
	ui.addNotification(null, E('p', {}, message), severity || 'info');
}

return view.extend({
	load: function() {
		return Promise.all([
			uci.load('wolplus'),
			L.resolveDefault(callHostHints(), {})
		]);
	},

	render: function(data) {
		var hostHints = data[1] || {};
		var m = new form.Map('wolplus', _('wolplus'),
			_('Wake up your LAN device') + '<br /><br />' +
			'<a href="https://github.com/FanxJK/openwrt-packages/tree/main/luci/applications/luci-app-wolplus" target="_blank">Powered by sundaqiang, rewritten in JavaScript by Fanx.</a>');

		var s = m.section(form.GridSection, 'macclient', _('macclient'));
		s.anonymous = true;
		s.addremove = true;
		s.sortable = true;

		var oName = s.option(form.Value, 'name', _('name'));
		oName.rmempty = false;

		var oMac = s.option(form.Value, 'macaddr', _('macaddr'));
		oMac.rmempty = false;
		oMac.datatype = 'macaddr';
		addHostHints(oMac, hostHints);

		var oIface = s.option(widgets.DeviceSelect, 'maceth', _('maceth'));
		oIface.rmempty = false;
		oIface.nocreate = false;

		var oWake = s.option(form.Button, '_awake', _('awake'));
		oWake.inputtitle = _('awake');
		oWake.inputstyle = 'apply';
		oWake.onclick = function(arg1, arg2) {
			var sectionId = (typeof arg1 === 'string') ? arg1 : arg2;

			if (!sectionId || hasUnsavedValues([ oName, oMac, oIface ], sectionId)) {
				notify(_('Please [Save & Apply] your changes first'), 'warning');
				return false;
			}

			var mac = normalize(uci.get('wolplus', sectionId, 'macaddr'));
			var iface = normalize(uci.get('wolplus', sectionId, 'maceth'));

			if (!mac || !iface) {
				notify(_('Please configure MAC address and network interface first'), 'warning');
				return false;
			}

			if (!isValidMac(mac) || !isValidInterface(iface)) {
				notify(_('Invalid MAC address or network interface'), 'warning');
				return false;
			}

			return fs.exec('/usr/bin/etherwake', [ '-D', '-i', iface, '-b', mac ]).then(function(res) {
				var output = commandOutput(res || {});

				if (res != null && res.code != null && +res.code !== 0)
					throw new Error(output || _('Wake request failed'));

				notify(output || _('Wake request sent'), 'info');
			}).catch(function(err) {
				notify(_('Wake request failed') + ': ' + (err.message || err), 'danger');
			});
		};

		return m.render();
	}
});
