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

function optionValue(option, sectionId) {
	var value = option.formvalue(sectionId);

	if (!normalize(value))
		value = uci.get('wolplus', sectionId, option.option);

	return normalize(value);
}

function optionChanged(option, sectionId) {
	return optionValue(option, sectionId) !== normalize(uci.get('wolplus', sectionId, option.option));
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

function showModal(title, message, output) {
	var body = [ E('p', {}, message) ];

	if (output)
		body.push(E('pre', {
			style: 'white-space: pre-wrap; max-height: 20em; overflow: auto;'
		}, output));

	body.push(E('div', { 'class': 'right' }, [
		E('button', {
			'class': 'btn cbi-button cbi-button-neutral',
			click: ui.hideModal
		}, _('Close'))
	]));

	ui.showModal(title, body);
}

function resolveClickArgs(args) {
	var sectionId = null;
	var button = null;

	for (var i = 0; i < args.length; i++) {
		if (typeof args[i] === 'string')
			sectionId = args[i];
		else if (args[i] && args[i].currentTarget)
			button = args[i].currentTarget;
		else if (args[i] && args[i].target)
			button = args[i].target;
	}

	return [ sectionId, button ];
}

function disableButton(button, disabled) {
	if (!button)
		return;

	button.disabled = disabled;
	button.textContent = disabled ? _('Collecting data...') : _('awake');
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

		var sendWake = function(mac, iface, button) {
			if (!mac || !iface) {
				showModal(_('Wake request failed'), _('Please configure MAC address and network interface first'));
				return false;
			}

			if (!isValidMac(mac) || !isValidInterface(iface)) {
				showModal(_('Wake request failed'), _('Invalid MAC address or network interface'));
				return false;
			}

			disableButton(button, true);

			return fs.exec('/usr/bin/etherwake', [ '-D', '-i', iface, '-b', mac ]).then(function(res) {
				var output = commandOutput(res || {});

				if (res != null && res.code != null && +res.code !== 0)
					throw new Error(output || _('Wake request failed'));

				showModal(_('Wake request sent'), output || _('Wake request sent'));
			}).catch(function(err) {
				showModal(_('Wake request failed'), err.message || String(err));
			}).then(function() {
				disableButton(button, false);
			});
		};

		var once = m.section(form.TypedSection, '_wake_once', _('One-time wake'), _('Send a Wake-on-LAN packet without saving the device.'));
		once.anonymous = true;
		once.addremove = false;
		once.cfgsections = function() {
			return [ '_once' ];
		};

		var onceMac = once.option(form.Value, '_once_mac', _('macaddr'));
		onceMac.rmempty = true;
		onceMac.datatype = 'macaddr';
		onceMac.cfgvalue = function() {
			return '';
		};
		onceMac.write = function() {};
		onceMac.remove = function() {};
		addHostHints(onceMac, hostHints);

		var onceIface = once.option(widgets.DeviceSelect, '_once_iface', _('maceth'));
		onceIface.rmempty = true;
		onceIface.nocreate = false;
		onceIface.cfgvalue = function() {
			return '';
		};
		onceIface.write = function() {};
		onceIface.remove = function() {};

		var onceWake = once.option(form.Button, '_once_awake', _('awake'));
		onceWake.inputtitle = _('awake');
		onceWake.inputstyle = 'apply';
		onceWake.renderWidget = function(sectionId) {
			return E('div', { style: 'margin: .75rem 0 1.25rem 0;' }, [
				E('button', {
					'class': 'cbi-button cbi-button-apply',
					type: 'button',
					click: function(ev) {
						ev.preventDefault();
						ev.stopPropagation();
						return sendWake(optionValue(onceMac, sectionId), optionValue(onceIface, sectionId), ev.currentTarget);
					}
				}, _('awake'))
			]);
		};
		onceWake.onclick = function() {
			var args = resolveClickArgs(arguments);
			return sendWake(optionValue(onceMac, '_once'), optionValue(onceIface, '_once'), args[1]);
		};
		onceWake.write = function() {};
		onceWake.remove = function() {};

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

		var wakeDevice = function(sectionId, button) {
			if (!sectionId || hasUnsavedValues([ oName, oMac, oIface ], sectionId)) {
				showModal(_('Please [Save & Apply] your changes first'), _('Please [Save & Apply] your changes first'));
				return false;
			}

			return sendWake(optionValue(oMac, sectionId), optionValue(oIface, sectionId), button);
		};

		var oWakeList = s.option(form.Button, '_awake', _('awake'));
		oWakeList.inputtitle = _('awake');
		oWakeList.inputstyle = 'apply';
		oWakeList.editable = true;
		oWakeList.modalonly = false;
		oWakeList.onclick = function() {
			var args = resolveClickArgs(arguments);
			return wakeDevice(args[0], args[1]);
		};
		oWakeList.write = function() {};
		oWakeList.remove = function() {};

		return m.render();
	}
});
