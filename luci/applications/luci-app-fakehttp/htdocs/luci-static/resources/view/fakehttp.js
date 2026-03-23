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

function hasListValue(config, option, sectionId) {
	return normalizeList(getOptionValue(config, option, sectionId)).length > 0;
}

function inferMode(config, sectionId, fallbackMode) {
	var configuredMode = normalizeValue(uci.get(config, sectionId, 'mode'));

	if (configuredMode)
		return configuredMode;

	return normalizeValue(uci.get(config, sectionId, 'payload_file')) ? 'payload' : fallbackMode;
}

function normalizePayloadValue(value, payloadDir) {
	value = normalizeValue(value);

	if (!value)
		return '';

	if (value.indexOf('/') === -1)
		return payloadDir + '/' + value;

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

	return value.indexOf(payloadDir + '/') === 0;
}

return view.extend({
	load: function() {
		return Promise.all([
			uci.load('fakehttp')
		]);
	},

	render: function() {
		var m = new form.Map('fakehttp', 'FakeHTTP',
			'FakeHTTP 可以将你的 TCP 连接伪装成 HTTP/HTTPS 流量以规避 DPI 检测，基于 nftables / iptables 的 Netfilter Queue (NFQUEUE)。<br />' +
			'用法: <a href="https://github.com/MikeWang000000/FakeHTTP/wiki" target="_blank">https://github.com/MikeWang000000/FakeHTTP/wiki</a>'
		);
		var payloadDir = '/etc/fakehttp/payloads';

		var statusSection = m.section(form.TypedSection, 'fakehttp');
		statusSection.anonymous = true;
		statusSection.addremove = false;
		statusSection.template = 'cbi/nullsection';

		var status = statusSection.option(form.DummyValue, '_status');
		status.render = function() {
			return callServiceList('fakehttp').then(function(res) {
				var isRunning = false;

				try {
					isRunning = res.fakehttp && res.fakehttp.instances &&
						Object.keys(res.fakehttp.instances).length > 0;
				} catch (e) {
					isRunning = false;
				}

				var statusText = isRunning ?
					'<em><b><font color="green">FakeHTTP ' + _('RUNNING') + '</font></b></em>' :
					'<em><b><font color="red">FakeHTTP ' + _('NOT RUNNING') + '</font></b></em>';

				return E('fieldset', { class: 'cbi-section' }, [
					E('p', { style: 'margin: 10px; font-size: 16px;' }, statusText)
				]);
			}).catch(function() {
				return E('fieldset', { class: 'cbi-section' }, [
					E('p', { style: 'margin: 10px; font-size: 16px;' }, '<em>' + _('Collecting data...') + '</em>')
				]);
			});
		};

		var s = m.section(form.NamedSection, 'main', 'fakehttp');
		s.anonymous = true;

		var oEnabled = s.option(form.Flag, 'enabled', '启用服务');
		oEnabled.default = '0';
		oEnabled.rmempty = false;

		var oMode = s.option(form.ListValue, 'mode', '工作模式',
			'显式选择当前使用主机名混淆还是二进制负载模式，切换模式时无需手动清空另一组配置。');
		oMode.value('host', '主机名模式 (-h / -e)');
		oMode.value('payload', '二进制文件模式 (-b)');
		oMode.default = 'host';
		oMode.rmempty = false;
		oMode.cfgvalue = function(sectionId) {
			return inferMode('fakehttp', sectionId, 'host');
		};

		var currentMode = function(sectionId) {
			return normalizeValue(getOptionValue('fakehttp', oMode, sectionId)) || inferMode('fakehttp', sectionId, 'host');
		};

		var oHost = s.option(form.DynamicList, 'host', '用于 HTTP 混淆的主机名 (-h)',
			'主机名模式下生效。至少填写一个 HTTP 或 HTTPS 主机名。');
		oHost.rmempty = true;
		oHost.retain = true;
		oHost.depends('mode', 'host');
		oHost.validate = function(sectionId, value) {
			if (currentMode(sectionId) !== 'host')
				return true;

			if (normalizeList(value).length > 0 || hasListValue('fakehttp', oHttpsHost, sectionId))
				return true;

			return '主机名模式下至少需要填写一个 -h 或 -e';
		};

		var oHttpsHost = s.option(form.DynamicList, 'httpshost', '用于 HTTPS 混淆的主机名 (-e)',
			'主机名模式下生效。至少填写一个 HTTP 或 HTTPS 主机名。');
		oHttpsHost.rmempty = true;
		oHttpsHost.retain = true;
		oHttpsHost.depends('mode', 'host');
		oHttpsHost.validate = function(sectionId, value) {
			if (currentMode(sectionId) !== 'host')
				return true;

			if (normalizeList(value).length > 0 || hasListValue('fakehttp', oHost, sectionId))
				return true;

			return '主机名模式下至少需要填写一个 -h 或 -e';
		};

		var oPayload = s.option(form.FileUpload, 'payload_file', 'Payload 文件管理与选择 (-b)',
			'二进制文件模式下生效。可在这里上传、下载、删除并选择 ' + payloadDir + ' 中的 payload 文件。');
		oPayload.root_directory = payloadDir;
		oPayload.browser = true;
		oPayload.enable_upload = true;
		oPayload.enable_remove = true;
		oPayload.enable_download = true;
		oPayload.show_hidden = false;
		oPayload.rmempty = true;
		oPayload.retain = true;
		oPayload.depends('mode', 'payload');
		oPayload.cfgvalue = function(sectionId) {
			return normalizePayloadValue(uci.get('fakehttp', sectionId, 'payload_file'), payloadDir);
		};
		oPayload.validate = function(sectionId, value) {
			if (currentMode(sectionId) !== 'payload')
				return true;

			value = normalizeValue(value);

			if (!value)
				return '二进制文件模式下请选择一个 payload 文件';

			if (!isManagedPayloadPath(value, payloadDir))
				return '只能选择 ' + payloadDir + ' 下的文件';

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
