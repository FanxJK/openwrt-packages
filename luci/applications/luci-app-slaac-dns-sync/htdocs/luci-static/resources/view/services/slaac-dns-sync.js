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

function renderHostTable(hosts) {
	const rows = [
		E('div', { 'class': 'tr table-titles' }, [
			E('div', { 'class': 'th' }, _('Host name')),
			E('div', { 'class': 'th' }, _('IPv4 address')),
			E('div', { 'class': 'th' }, _('IPv6 address'))
		])
	];

	hosts.forEach(function(host) {
		rows.push(E('div', { 'class': 'tr' }, [
			E('div', { 'class': 'td' }, E('code', {}, host.hostname)),
			E('div', { 'class': 'td' }, renderAddressList(host.ipv4)),
			E('div', { 'class': 'td' }, renderAddressList(host.ipv6))
		]));
	});

	return E('div', { 'class': 'table' }, rows);
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

function renderPrefixes(status) {
	const prefixes = displayedPrefixes(status);
	if (!prefixes.length)
		return E('p', {}, E('em', {}, _('No IPv6 prefix is currently reported by netifd.')));

	return E('ul', { 'style': 'margin-top:.5em' }, prefixes.map(function(prefix) {
		const details = prefix.sources.map(prefixSourceLabel);
		if (prefix.interfaces.length)
			details.push(prefix.interfaces.join(', '));
		return E('li', {}, [
			E('code', {}, prefix.prefix),
			details.length ? ' (%s)'.format(details.join(', ')) : ''
		]);
	}));
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

	children.push(E('div', { 'class': 'cbi-section-descr' }, [
		E('strong', {}, _('Current IPv6 prefixes')),
		renderPrefixes(status)
	]));

	children.push(E('details', { 'id': DETAILS_ID }, [
		E('summary', {}, '%s (%d)'.format(_('Generated dnsmasq host records'), status.hosts.length)),
		status.hosts.length
			? renderHostTable(status.hosts)
			: E('p', {}, E('em', {}, _('No records have been generated yet. The router must first learn a named host IPv6 address through NDP.')))
	]));

	return E('div', {}, children);
}

function refreshStatus() {
	return loadStatus().then(function(status) {
		const node = document.getElementById('slaac-dns-sync-status');
		if (!node)
			return;

		const details = node.querySelector('#' + DETAILS_ID);
		const wasOpen = details ? details.open : false;
		dom.content(node, statusView(status));

		const refreshedDetails = node.querySelector('#' + DETAILS_ID);
		if (refreshedDetails)
			refreshedDetails.open = wasOpen;
	});
}

return view.extend({
	load: function() {
		return Promise.all([
			uci.load('slaac_dns_sync'),
			loadStatus(),
			uci.load('dhcp'),
			uci.load('network')
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
			poll.add(refreshStatus, 10);
			return node;
		});
	}
});
