'use strict';
'require view';
'require form';
'require uci';
'require rpc';
'require poll';

var callServiceList = rpc.declare({
	object: 'service',
	method: 'list',
	params: [ 'name' ],
	expect: { '': {} }
});

function isServiceRunning(res) {
	var service = res && res.uugamebooster;
	var instances = service && service.instances;
	var instanceNames = instances ? Object.keys(instances) : [];
	var hasInstance = false;

	for (var i = 0; i < instanceNames.length; i++) {
		var instance = instances[instanceNames[i]];

		if (instance && instance.running === false)
			continue;

		hasInstance = true;

		if (!instance || instance.running !== false)
			return true;
	}

	return hasInstance;
}

function renderStatus(running) {
	if (running == null)
		return E('em', {}, _('Collecting data...'));

	return E('em', {}, [
		E('b', {}, [
			E('span', { style: 'color: ' + (running ? 'green' : 'red') },
				'UU GameAcc ' + (running ? _('RUNNING') : _('NOT RUNNING')))
		])
	]);
}

function updateStatus(node, running) {
	if (!node)
		return;

	while (node.firstChild)
		node.removeChild(node.firstChild);

	node.appendChild(renderStatus(running));
}

return view.extend({
	load: function() {
		return Promise.all([
			uci.load('uugamebooster'),
			L.resolveDefault(callServiceList('uugamebooster'), null)
		]);
	},

	render: function(data) {
		var m = new form.Map('uugamebooster', _('UU Game Accelerator'), _('A Paid Game Acceleration service'));
		var statusNode = null;
		var initialStatus = data[1] ? isServiceRunning(data[1]) : null;

		var statusSection = m.section(form.TypedSection, 'uugamebooster');
		statusSection.anonymous = true;
		statusSection.addremove = false;
		statusSection.template = 'cbi/nullsection';

		var status = statusSection.option(form.DummyValue, '_status');
		status.render = function() {
			statusNode = E('p', { style: 'margin: 10px; font-size: 16px;' }, renderStatus(initialStatus));

			poll.add(function() {
				return L.resolveDefault(callServiceList('uugamebooster'), null).then(function(res) {
					updateStatus(statusNode, res ? isServiceRunning(res) : null);
				});
			}, 3);

			return E('fieldset', { 'class': 'cbi-section' }, statusNode);
		};

		var s = m.section(form.NamedSection, 'config', 'uugamebooster');
		s.anonymous = true;
		s.addremove = false;

		var enabled = s.option(form.Flag, 'enabled', _('Enable'));
		enabled.default = '0';
		enabled.rmempty = false;

		var qrSection = m.section(form.TypedSection, 'uugamebooster');
		qrSection.anonymous = true;
		qrSection.addremove = false;
		qrSection.template = 'cbi/nullsection';

		var qr = qrSection.option(form.DummyValue, '_qcode');
		qr.render = function() {
			return E('fieldset', { 'class': 'cbi-section' }, [
				E('p', { id: 'uugamebooster_qcode' }, [
					E('img', { src: '/uugamebooster/uuios.png', height: '300', alt: 'iOS' }),
					E('img', { src: '/uugamebooster/uuandriod.png', height: '300', alt: 'Android' })
				])
			]);
		};

		return m.render();
	}
});
