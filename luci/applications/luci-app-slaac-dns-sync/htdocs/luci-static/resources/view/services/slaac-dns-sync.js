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
const DETAILS_ID = 'slaac-dns-sync-records';
const STATE_ID = 'slaac-dns-sync-state';
const RECORD_COUNT_ID = 'slaac-dns-sync-record-count';
const HOST_COUNT_ID = 'slaac-dns-sync-host-count';
const WARNING_ID = 'slaac-dns-sync-warning';
const HOST_TABLE_ID = 'slaac-dns-sync-host-table';
const PREFIX_TABLE_ID = 'slaac-dns-sync-prefix-table';

let hostTable = null;
let prefixTable = null;

const callServiceList = rpc.declare({
	object: 'service',
	method: 'list',
	params: [ 'name' ],
	expect: { '': {} }
});

const callHostHints = rpc.declare({
	object: 'luci-rpc',
	method: 'getHostHints',
	expect: { '': {} }
});

const callNetworkDump = rpc.declare({
	object: 'network.interface',
	method: 'dump',
	expect: { 'interface': [] }
});

function sortedUnique(values) {
	const seen = {};
	const result = [];

	values.forEach(function(value) {
		value = String(value || '').trim();
		if (!value || seen[value])
			return;
		seen[value] = true;
		result.push(value);
	});
	return result.sort();
}

function hintIPv4Addresses(hostname, hints) {
	const fullName = String(hostname || '').toLowerCase().replace(/\.$/, '');
	const shortName = fullName.split('.')[0];
	const addresses = [];

	Object.keys(hints || {}).forEach(function(key) {
		const hint = hints[key] || {};
		const hintName = String(hint.name || '').toLowerCase().replace(/\.$/, '');
		const hintShortName = hintName.split('.')[0];

		if (!hintName || (hintName !== fullName && hintName !== shortName && hintShortName !== shortName))
			return;

		L.toArray(hint.ipaddrs).forEach(function(address) {
			addresses.push(address);
		});
	});

	return sortedUnique(addresses);
}

function parseHostRecords(text, hints) {
	const hosts = {};

	String(text || '').split(/\n/).forEach(function(line) {
		line = line.trim();
		if (!line || line.charAt(0) === '#')
			return;

		const fields = line.split(/\s+/);
		if (fields.length < 2)
			return;

		const ipv6 = fields[0];
		const hostname = fields[1].toLowerCase().replace(/\.$/, '');
		if (!hosts[hostname])
			hosts[hostname] = { hostname: hostname, ipv4: [], ipv6: [] };
		hosts[hostname].ipv6.push(ipv6);
	});

	return Object.keys(hosts).sort().map(function(hostname) {
		const host = hosts[hostname];
		host.ipv4 = hintIPv4Addresses(hostname, hints);
		host.ipv6 = sortedUnique(host.ipv6);
		return host;
	});
}

function collectIPv6Prefixes(interfaces) {
	const prefixes = {};

	function add(entry, source, iface) {
		entry = entry || {};
		let address = String(entry.address || '').trim();
		let mask = entry.mask;

		if (!address && entry['local-address']) {
			address = String(entry['local-address'].address || '').trim();
			mask = mask != null ? mask : entry['local-address'].mask;
		}
		if (!address)
			return;

		const prefix = address.indexOf('/') !== -1 || mask == null
			? address
			: address + '/' + mask;
		if (!prefixes[prefix])
			prefixes[prefix] = { prefix: prefix, interfaces: [], sources: [] };
		if (iface && prefixes[prefix].interfaces.indexOf(iface) === -1)
			prefixes[prefix].interfaces.push(iface);
		if (prefixes[prefix].sources.indexOf(source) === -1)
			prefixes[prefix].sources.push(source);
	}

	L.toArray(interfaces).forEach(function(iface) {
		const name = iface.interface || '?';
		L.toArray(iface['ipv6-prefix']).forEach(function(prefix) {
			add(prefix, 'delegated', name);
		});
		L.toArray(iface['ipv6-prefix-assignment']).forEach(function(prefix) {
			add(prefix, 'assigned', name);
		});
	});

	return Object.keys(prefixes).sort().map(function(prefix) {
		return prefixes[prefix];
	});
}

function loadStatus() {
	return Promise.all([
		L.resolveDefault(callServiceList(SERVICE), {}),
		L.resolveDefault(fs.read(HOSTFILE), ''),
		L.resolveDefault(callHostHints(), {}),
		L.resolveDefault(callNetworkDump(), [])
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
			records: records,
			hosts: parseHostRecords(data[1], data[2]),
			prefixes: collectIPv6Prefixes(data[3])
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

function renderAddressList(addresses) {
	if (!addresses.length)
		return E('em', {}, '-');

	const children = [];
	addresses.forEach(function(address, index) {
		if (index)
			children.push(E('br'));
		children.push(E('code', {}, address));
	});
	return E('span', {}, children);
}

function hostTableRows(hosts) {
	return hosts.map(function(host) {
		return [
			[ host.hostname, E('code', {}, host.hostname) ],
			[ host.ipv4.join(' '), renderAddressList(host.ipv4) ],
			[ host.ipv6.join(' '), renderAddressList(host.ipv6) ]
		];
	});
}

function displayedPrefixes(status) {
	const prefixes = status.prefixes.map(function(prefix) {
		return {
			prefix: prefix.prefix,
			interfaces: prefix.interfaces.slice(),
			sources: prefix.sources.slice()
		};
	});
	const configuredUla = String(uci.get_first('network', 'globals', 'ula_prefix') || '').trim();

	if (configuredUla) {
		let configured = prefixes.filter(function(prefix) {
			return prefix.prefix === configuredUla;
		})[0];
		if (!configured) {
			configured = { prefix: configuredUla, interfaces: [], sources: [] };
			prefixes.push(configured);
		}
		if (configured.sources.indexOf('configured') === -1)
			configured.sources.push('configured');
	}

	return prefixes.sort(function(a, b) {
		return a.prefix.localeCompare(b.prefix);
	});
}

function prefixSourceLabel(source) {
	if (source === 'delegated')
		return _('Delegated');
	if (source === 'assigned')
		return _('Assigned');
	if (source === 'configured')
		return _('Configured ULA');
	return source;
}

function prefixTableRows(status) {
	return displayedPrefixes(status).map(function(prefix) {
		return [
			[ prefix.prefix, E('code', {}, prefix.prefix) ],
			prefix.sources.map(prefixSourceLabel).join(', '),
			prefix.interfaces.length ? prefix.interfaces.join(', ') : '-'
		];
	});
}

function statusState(status) {
	const enabled = uci.get('slaac_dns_sync', 'main', 'enabled') === '1';

	if (!enabled)
		return { labelClass: 'label', stateText: _('Disabled') };
	if (status.running)
		return { labelClass: 'label success', stateText: _('Running') };
	return { labelClass: 'label warning', stateText: _('Stopped or starting') };
}

function statusView(status) {
	const state = statusState(status);
	const problem = dnsmasqProblem();

	hostTable = new ui.Table([
		_('Host name'),
		_('IPv4 address'),
		_('IPv6 address')
	], {
		id: HOST_TABLE_ID,
		sortable: true
	});
	hostTable.update(hostTableRows(status.hosts),
		_('No records have been generated yet. The router must first learn a named host IPv6 address through NDP.'));

	prefixTable = new ui.Table([
		_('IPv6 prefix'),
		_('Source'),
		_('Interface')
	], {
		id: PREFIX_TABLE_ID,
		sortable: true
	});
	prefixTable.update(prefixTableRows(status), _('No IPv6 prefix is currently reported by netifd.'));

	return E('div', {}, [
		E('p', {}, [
			E('span', { 'id': STATE_ID, 'class': state.labelClass }, state.stateText),
			' ',
			E('span', { 'id': RECORD_COUNT_ID }, _('%d generated AAAA record(s)').format(status.records.length))
		]),
		E('div', {
			'id': WARNING_ID,
			'class': 'alert-message warning',
			'hidden': problem ? null : ''
		}, problem || ''),
		E('div', { 'class': 'cbi-section' }, [
			E('h3', {}, _('Current IPv6 prefixes')),
			prefixTable.render()
		]),
		E('details', { 'id': DETAILS_ID, 'class': 'cbi-section' }, [
			E('summary', {}, [
				E('strong', {}, _('Generated dnsmasq host records')),
				' (',
				E('span', { 'id': HOST_COUNT_ID }, String(status.hosts.length)),
				')'
			]),
			hostTable.render()
		])
	]);
}

function updateStatusView(status) {
	const root = document.getElementById('slaac-dns-sync-status');
	if (!root)
		return;

	const state = statusState(status);
	const stateNode = document.getElementById(STATE_ID);
	const recordCountNode = document.getElementById(RECORD_COUNT_ID);
	const hostCountNode = document.getElementById(HOST_COUNT_ID);
	const warningNode = document.getElementById(WARNING_ID);
	const problem = dnsmasqProblem();

	if (stateNode) {
		stateNode.className = state.labelClass;
		dom.content(stateNode, state.stateText);
	}
	if (recordCountNode)
		dom.content(recordCountNode, _('%d generated AAAA record(s)').format(status.records.length));
	if (hostCountNode)
		dom.content(hostCountNode, String(status.hosts.length));
	if (warningNode) {
		warningNode.hidden = !problem;
		dom.content(warningNode, problem || '');
	}
	if (hostTable)
		hostTable.update(hostTableRows(status.hosts),
			_('No records have been generated yet. The router must first learn a named host IPv6 address through NDP.'));
	if (prefixTable)
		prefixTable.update(prefixTableRows(status), _('No IPv6 prefix is currently reported by netifd.'));
}

function refreshStatus() {
	return loadStatus().then(updateStatusView);
}

return view.extend({
	load: function() {
		return loadStatus();
	},

	render: function(status) {
		let m, s, o;

		m = new form.Map('slaac_dns_sync', _('SLAAC DNS Sync'),
			_('Publish local AAAA records by correlating OpenWrt LuCI host hints: DHCPv4/static host names provide the name, while NDP provides the actual SLAAC IPv6 address. DHCPv6 is not enabled or required.'));
		m.chain('dhcp');
		m.chain('network');

		s = m.section(form.NamedSection, 'main', 'main');
		s.anonymous = true;
		s.addremove = false;
		/* form.js stores tab names as Array properties; avoid names such as "filter". */
		s.tab('service', _('Service'));
		s.tab('policy', _('Address policy'));
		s.tab('hosts', _('Host filtering'));

		o = s.taboption('service', form.DummyValue, '_status', _('Current status'));
		o.renderWidget = function() {
			return E('div', { 'id': 'slaac-dns-sync-status' }, statusView(status));
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
			poll.add(refreshStatus, 10);
			return node;
		});
	}
});
