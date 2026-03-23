'use strict';
'require view';
'require form';
'require uci';
'require rpc';
'require tools.widgets as widgets';

var callServiceList = rpc.declare({
	object: 'service',
	method: 'list',
	params: [ 'name' ],
	expect: { '': {} }
});

function normalizeList(value) {
	if (Array.isArray(value))
		return value.map(function(entry) {
			return String(entry).trim();
		}).filter(function(entry) {
			return entry.length > 0;
		});

	if (value == null)
		return [];

	value = String(value).trim();
	return value ? [ value ] : [];
}

function normalizeValue(value) {
	if (value == null)
		return '';

	return String(value).trim();
}

function getOptionValue(config, option, sectionId) {
	var value = option.formvalue(sectionId);

	if (value == null)
		value = uci.get(config, sectionId, option.option);

	return value;
}

function isManagedPayloadPath(value, payloadDir) {
	value = normalizeValue(value);

	if (!value)
		return true;

	if (value === '.' || value === '..')
		return false;

	if (value.indexOf('//') !== -1 || value.indexOf('/./') !== -1 || value.indexOf('/../') !== -1 ||
			value.slice(-2) === '/.' || value.slice(-3) === '/..')
		return false;

	if (value.indexOf('/') === -1)
		return true;

	return value.indexOf(payloadDir + '/') === 0;
}

return view.extend({
	load: function() {
		return Promise.all([
			uci.load('fakesip')
		]);
	},

	render: function() {
		var m = new form.Map('fakesip', 'FakeSIP',
			'FakeSIP 可以将你的 UDP 流量伪装成 SIP 协议以规避 DPI 检测，基于 nftables / iptables 的 Netfilter Queue (NFQUEUE)。<br />' +
			'用法: <a href="https://github.com/MikeWang000000/FakeSIP/wiki" target="_blank">https://github.com/MikeWang000000/FakeSIP/wiki</a>'
		);
		var payloadDir = '/etc/fakesip/payloads';

		var statusSection = m.section(form.TypedSection, 'fakesip');
		statusSection.anonymous = true;
		statusSection.addremove = false;
		statusSection.template = 'cbi/nullsection';

		var status = statusSection.option(form.DummyValue, '_status');
		status.render = function() {
			return callServiceList('fakesip').then(function(res) {
				var isRunning = false;

				try {
					isRunning = res.fakesip && res.fakesip.instances &&
						Object.keys(res.fakesip.instances).length > 0;
				} catch (e) {
					isRunning = false;
				}

				var statusText = isRunning ?
					'<em><b><font color="green">FakeSIP ' + _('RUNNING') + '</font></b></em>' :
					'<em><b><font color="red">FakeSIP ' + _('NOT RUNNING') + '</font></b></em>';

				return E('fieldset', { class: 'cbi-section' }, [
					E('p', { style: 'margin: 10px; font-size: 16px;' }, statusText)
				]);
			}).catch(function() {
				return E('fieldset', { class: 'cbi-section' }, [
					E('p', { style: 'margin: 10px; font-size: 16px;' }, '<em>' + _('Collecting data...') + '</em>')
				]);
			});
		};

		var s = m.section(form.NamedSection, 'main', 'fakesip');
		s.anonymous = true;

		var oEnabled = s.option(form.Flag, 'enabled', '启用服务');
		oEnabled.default = '0';
		oEnabled.rmempty = false;

		var oHost = s.option(form.DynamicList, 'host', '用于 SIP 混淆的 URI (-u)',
			'每个值对应一个 -u 参数。设置 -b 后，此项必须留空。');
		oHost.rmempty = true;

		var oPayload = s.option(form.Value, 'payload_file', '二进制负载文件 (-b)',
			'填写文件名时会从 ' + payloadDir + ' 读取；也可填写该目录下的绝对路径。设置此项后，-u 必须留空。该目录会在 sysupgrade 时保留。');
		oPayload.placeholder = 'payload.bin';
		oPayload.rmempty = true;

		oPayload.validate = function(sectionId, value) {
			value = normalizeValue(value);

			if (!value)
				return true;

			if (!isManagedPayloadPath(value, payloadDir))
				return '请填写文件名，或 ' + payloadDir + '/ 下的绝对路径';

			if (normalizeList(getOptionValue('fakesip', oHost, sectionId)).length > 0)
				return '-b 不能与 -u 同时设置';

			return true;
		};

		oHost.validate = function(sectionId, value) {
			if (normalizeList(value).length > 0 && normalizeValue(getOptionValue('fakesip', oPayload, sectionId)))
				return '设置 -b 后，-u 必须留空';

			return true;
		};

		var i = s.option(widgets.DeviceSelect, 'iface', '网络接口名称 (-i)',
			'可以添加多个网络接口，每个接口对应一个 -i 参数');
		i.multiple = true;
		i.rmempty = false;
		i.nocreate = false;

		var mopt = s.option(form.Value, 'fwmark', '用于绕过队列的 fwmark (-m)');
		mopt.datatype = 'uinteger';
		mopt.rmempty = true;

		var nopt = s.option(form.Value, 'num', 'Netfilter 队列编号 (-n)');
		nopt.datatype = 'uinteger';
		nopt.rmempty = true;

		var ropt = s.option(form.Value, 'repeat', '重复生成的数据包次数 (-r)');
		ropt.datatype = 'uinteger';
		ropt.rmempty = true;

		var topt = s.option(form.Value, 'ttl', '生成数据包的 TTL (-t)', '默认值为 3');
		topt.datatype = 'uinteger';
		topt.rmempty = true;

		var xopt = s.option(form.Value, 'mask', '设置 fwmark 的掩码 (-x)');
		xopt.datatype = 'uinteger';
		xopt.rmempty = true;

		var yopt = s.option(form.Value, 'pct', '将 TTL 动态提升到估算路由跳数的百分比 (-y)');
		yopt.datatype = 'uinteger';
		yopt.rmempty = true;

		return m.render();
	},

	handleSaveApply: function(ev) {
		return this.super('handleSaveApply', [ ev ]);
	}
});
