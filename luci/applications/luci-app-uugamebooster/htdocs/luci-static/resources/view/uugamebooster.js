'use strict';
'require view';
'require form';
'require uci';
'require rpc';
'require poll';
'require fs';
'require ui';

var HELPER = '/usr/bin/uugamebooster-update';

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
				'UU Game Booster ' + (running ? _('RUNNING') : _('NOT RUNNING')))
		])
	]);
}

function versionText(res) {
	var output = [ res && res.stdout, res && res.stderr ].filter(function(value) {
		return value != null && String(value).trim().length > 0;
	}).join('\n');
	var match = output.match(/^version:\s*(\S+)/m);

	return match ? match[1] : _('Unknown');
}

function latestVersionText(res) {
	var output = [ res && res.stdout, res && res.stderr ].filter(function(value) {
		return value != null && String(value).trim().length > 0;
	}).join('\n').trim();

	return output || _('Unknown');
}

function updateStatus(node, running) {
	if (!node)
		return;

	while (node.firstChild)
		node.removeChild(node.firstChild);

	node.appendChild(renderStatus(running));
}

function updateAvailable(currentVersion, latestVersion) {
	return currentVersion !== _('Unknown') && latestVersion !== _('Unknown') && currentVersion !== latestVersion;
}

return view.extend({
	load: function() {
		return Promise.all([
			uci.load('uugamebooster'),
			L.resolveDefault(callServiceList('uugamebooster'), null),
			L.resolveDefault(fs.exec('/usr/bin/uugamebooster', [ '-v' ]), null),
			L.resolveDefault(fs.exec(HELPER, [ 'latest' ]), null)
		]);
	},

	render: function(data) {
		var m = new form.Map('uugamebooster', _('UU Game Accelerator'), _('A Paid Game Acceleration service'));
		var statusNode = null;
		var initialStatus = data[1] ? isServiceRunning(data[1]) : null;
		var currentVersion = data[2] ? versionText(data[2]) : _('Unknown');
		var latestVersion = data[3] ? latestVersionText(data[3]) : _('Unknown');

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

		var version = s.option(form.DummyValue, '_version', _('Current Version'));
		version.cfgvalue = function() {
			return currentVersion;
		};

		var latest = s.option(form.DummyValue, '_latest_version', _('Latest Version'));
		latest.cfgvalue = function() {
			return latestVersion;
		};

		if (updateAvailable(currentVersion, latestVersion)) {
			var update = s.option(form.DummyValue, '_online_update', _('Online Update'));
			update.render = function() {
				return E('div', { 'class': 'cbi-value', style: 'margin: 12px 0 10px 0;' }, [
					E('label', { 'class': 'cbi-value-title' }, _('Online Update')),
					E('div', { 'class': 'cbi-value-field' }, [
						E('button', {
							'class': 'btn cbi-button cbi-button-apply',
							type: 'button',
							click: function(ev) {
								return update.onclick('config', ev);
							}
						}, _('Update Now'))
					])
				]);
			};
			update.onclick = function(sectionId, ev) {
				var button = ev && ev.currentTarget;
				var logNode = E('pre', { style: 'white-space: pre-wrap; max-height: 24em; overflow: auto;' }, _('Starting update...'));
				var timer = null;

				function setButton(disabled) {
					if (!button)
						return;

					button.disabled = disabled;
					button.textContent = disabled ? _('Updating...') : _('Update Now');
				}

				function refreshLog() {
					return Promise.all([
						L.resolveDefault(fs.exec(HELPER, [ 'log' ]), null),
						L.resolveDefault(fs.exec(HELPER, [ 'status' ]), null)
					]).then(function(data) {
						var output = latestVersionText(data[0]);
						var status = latestVersionText(data[1]);

						logNode.textContent = output;
						logNode.scrollTop = logNode.scrollHeight;

						if (status === 'running') {
							timer = window.setTimeout(refreshLog, 1000);
							return;
						}

						setButton(false);

						if (status === 'completed')
							window.setTimeout(function() { window.location.reload(); }, 1200);
					});
				}

				setButton(true);
				ui.showModal(_('Online Update'), [
					logNode,
					E('div', { 'class': 'right' }, [
						E('button', {
							'class': 'btn cbi-button cbi-button-neutral',
							click: function() {
								if (timer)
									window.clearTimeout(timer);
								ui.hideModal();
							}
						}, _('Close'))
					])
				]);

				return fs.exec(HELPER, [ 'start' ]).then(function() {
					return refreshLog();
				}).catch(function(err) {
					setButton(false);
					logNode.textContent = err.message || String(err);
				});
			};
			update.write = function() {};
			update.remove = function() {};
		}

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
