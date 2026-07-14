'use strict';
'require view';
'require form';
'require uci';
'require rpc';
'require fs';
'require poll';
'require ui';
'require dom';

const SERVICE = 'slaac-dns-sync';
const HOSTFILE = '/tmp/hosts/slaac-dns-sync';

const callServiceList = rpc.declare({
	object: 'service',
	method: 'list',
	params: [ 'name' ],
	expect: { '': {} }
});

function loadStatus() {
	return Promise.all([
		L.resolveDefault(callServiceList(SERVICE), {}),
		L.resolveDefault(fs.read(HOSTFILE), '')
	]).then(function(data) {
		const service = data[0][SERVICE] || {};
		const instances = service.instances || {};
		const running = Object.keys(instances).some(function(name) {
			return instances[name].running === true;
		});
		const records = String(data[1] || '').split(/\n/).filter(function(line) {
			return line.length > 0 && line.charAt(0) !== '#';
		});

		return {
			running: running,
			records: records
		};
	});
}

function dnsmasqProblem() {
	const ignoreHosts = uci.get_first('dhcp', 'dnsmasq', 'ignore_hosts_dir');
	const filterAAAA = uci.get_first('dhcp', 'dnsmasq', 'filter_aaaa');
	const filteredTypes = L.toArray(uci.get_first('dhcp', 'dnsmasq', 'filter_rr'));

	if (ignoreHosts === '1')
		return _('dnsmasq is configured to ignore /tmp/hosts. Set ignore_hosts_dir to 0 before enabling synchronization.');

	if (filterAAAA === '1' || filteredTypes.indexOf('AAAA') !== -1)
		return _('dnsmasq is configured to filter AAAA records. Disable AAAA filtering before enabling synchronization.');

	return null;
}

function statusView(status) {
	const enabled = uci.get('slaac_dns_sync', 'main', 'enabled') === '1';
	let labelClass, stateText;

	if (!enabled) {
		labelClass = 'label';
		stateText = _('Disabled');
	}
	else if (status.running) {
		labelClass = 'label success';
		stateText = _('Running');
	}
	else {
		labelClass = 'label warning';
		stateText = _('Stopped or starting');
	}

	const children = [
		E('p', {}, [
			E('span', { 'class': labelClass }, stateText),
			' ',
			_('%d generated AAAA record(s)').format(status.records.length)
		])
	];
	const problem = dnsmasqProblem();

	if (problem)
		children.push(E('div', { 'class': 'alert-message warning' }, problem));

	children.push(E('details', {}, [
		E('summary', {}, _('Generated dnsmasq host records')),
		status.records.length
			? E('pre', { 'style': 'white-space:pre-wrap;overflow:auto' }, status.records.join('\n'))
			: E('p', {}, E('em', {}, _('No records have been generated yet. The router must first learn a named host IPv6 address through NDP.')))
	]));

	return E('div', {}, children);
}

function refreshStatus() {
	return loadStatus().then(function(status) {
		const node = document.getElementById('slaac-dns-sync-status');
		if (node)
			dom.content(node, statusView(status));
	});
}

return view.extend({
	load: function() {
		return Promise.all([
			uci.load('slaac_dns_sync'),
			loadStatus(),
			uci.load('dhcp')
		]);
	},

	render: function(data) {
		let m, s, o;

		m = new form.Map('slaac_dns_sync', _('SLAAC DNS Sync'),
			_('Publish local AAAA records by correlating OpenWrt LuCI host hints: DHCPv4/static host names provide the name, while NDP provides the actual SLAAC IPv6 address. DHCPv6 is not enabled or required.'));

		s = m.section(form.NamedSection, 'main', 'main');
		s.anonymous = true;
		s.addremove = false;
		/* form.js stores tab names as Array properties; avoid names such as "filter". */
		s.tab('service', _('Service'));
		s.tab('policy', _('Address policy'));
		s.tab('hosts', _('Host filtering'));

		o = s.taboption('service', form.DummyValue, '_status', _('Current status'));
		o.renderWidget = function() {
			return E('div', { 'id': 'slaac-dns-sync-status' }, statusView(data[1]));
		};

		o = s.taboption('service', form.Flag, 'enabled', _('Enable SLAAC DNS synchronization'),
			_('Master switch. Enabling starts the procd service; disabling stops it and removes the generated dnsmasq records.'));
		o.default = '0';
		o.rmempty = false;

		o = s.taboption('service', form.Button, '_sync', _('Manual synchronization'),
			_('Immediately rebuild records from luci-rpc getHostHints.'));
		o.inputtitle = _('Synchronize now');
		o.inputstyle = 'apply';
		o.depends('enabled', '1');
		o.onclick = function() {
			return fs.exec('/usr/sbin/slaac-dns-sync', [ '--once' ]).then(function(result) {
				if (result.code !== 0)
					throw new Error(result.stderr || _('Synchronization failed'));

				ui.addNotification(null, E('p', {}, _('SLAAC DNS records synchronized.')));
				return refreshStatus();
			}).catch(function(error) {
				ui.addNotification(_('Synchronization failed'), E('p', {}, String(error)), 'error');
			});
		};

		o = s.taboption('policy', form.ListValue, 'address_mode', _('IPv6 address policy'),
			_('Link-local, multicast, loopback and unspecified addresses are always excluded.'));
		o.value('prefer_ula', _('Prefer ULA; use GUA only when no ULA exists'));
		o.value('prefer_gua', _('Prefer GUA; use ULA only when no GUA exists'));
		o.value('ula', _('ULA only'));
		o.value('gua', _('GUA only'));
		o.value('all', _('Publish both ULA and GUA'));
		o.default = 'prefer_ula';
		o.rmempty = false;

		o = s.taboption('policy', form.Value, 'domain', _('Local domain'),
			_('Leave empty to inherit the domain from the first dnsmasq instance.'));
		o.placeholder = 'lan';
		o.datatype = 'hostname';
		o.rmempty = true;

		o = s.taboption('policy', form.Value, 'interval', _('Reconciliation interval'),
			_('Periodic synchronization interval in seconds. Interface changes also trigger synchronization.'));
		o.datatype = 'range(10,3600)';
		o.default = '60';
		o.rmempty = false;

		o = s.taboption('policy', form.Flag, 'require_ipv4', _('Require an IPv4 host hint'),
			_('Only publish IPv6 neighbors that also have an IPv4 lease or static host hint. This avoids registering unrelated reverse-DNS names.'));
		o.default = '1';
		o.rmempty = false;

		o = s.taboption('policy', form.Flag, 'include_short', _('Publish short-name aliases'),
			_('For example, publish both docker.lan and docker.'));
		o.default = '1';
		o.rmempty = false;

		o = s.taboption('policy', form.Value, 'max_addresses', _('Maximum addresses per host'),
			_('0 publishes all selected addresses. A positive limit cannot reliably distinguish stable RFC 7217 addresses from temporary RFC 4941 addresses.'));
		o.datatype = 'range(0,32)';
		o.default = '0';
		o.rmempty = false;

		o = s.taboption('policy', form.Flag, 'remove_on_stop', _('Remove records when stopped'));
		o.default = '1';
		o.rmempty = false;

		o = s.taboption('hosts', form.DynamicList, 'include', _('Included host names'),
			_('Optional allowlist. Leave empty to include every named host. For servers, an allowlist such as docker and nas is recommended.'));
		o.datatype = 'hostname';
		o.rmempty = true;

		o = s.taboption('hosts', form.DynamicList, 'exclude', _('Excluded host names'),
			_('Optional denylist. Exclusions take precedence over inclusions.'));
		o.datatype = 'hostname';
		o.rmempty = true;

		return m.render().then(function(node) {
			poll.add(refreshStatus, 5);
			return node;
		});
	}
});
