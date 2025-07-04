'use strict';
'require view';
'require form';
'require uci';
'require rpc';
'require tools.widgets as widgets';

var callServiceList = rpc.declare({
    object: 'service',
    method: 'list',
    params: ['name'],
    expect: { '': {} }
});

return view.extend({
    load: function() {
        return Promise.all([
            uci.load('fakehttp')
        ]);
    },

    render: function() {
        var m = new form.Map('fakehttp', 'FakeHTTP',
            'FakeHTTP 可以将你的所有 TCP 连接伪装为 HTTP 等协议以规避深度包检测 (DPI)，是一个基于 nftables / iptables 与 Netfilter Queue (NFQUEUE) 的网络工具。' + '<br />' +
            '用法: <a href="https://github.com/MikeWang000000/FakeHTTP/wiki" target="_blank">https://github.com/MikeWang000000/FakeHTTP/wiki</a>'
        );

        // Status section - independent status box
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

        var o_enabled = s.option(form.Flag, 'enabled', '启用服务');
        o_enabled.default = '0';
        o_enabled.rmempty = false;

        var o_host = s.option(form.DynamicList, 'host', '用于混淆的 HTTP 主机名 (-h)',
            '每个主机名对应一个 -h 参数，添加多个主机名可轮换混淆（支持 HTTP 与 HTTPS 共同轮换）');
        o_host.rmempty = true;

        var o_httpshost = s.option(form.DynamicList, 'httpshost', '用于混淆的 HTTPS 主机名 (-e)',
            '每个主机名对应一个 -e 参数，添加多个主机名可轮换混淆（支持 HTTP 与 HTTPS 共同轮换）');
        o_httpshost.rmempty = true;

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

        var ropt = s.option(form.Value, 'repeat', '重复生成的数据包 <repeat> 次 (-r)');
        ropt.datatype = 'uinteger';
        ropt.rmempty = true;

        var topt = s.option(form.Value, 'ttl', '生成数据包的 TTL (-t) 默认为 3');
        topt.datatype = 'uinteger';
        topt.rmempty = true;

        var xopt = s.option(form.Value, 'mask', '设置 fwmark 的掩码 (-x)');
        xopt.datatype = 'uinteger';
        xopt.rmempty = true;

        var yopt = s.option(form.Value, 'pct', '将 TTL 动态提升至估算跃点数的 <pct>% (-y)');
        yopt.datatype = 'uinteger';
        yopt.rmempty = true;

        return m.render();
    },

    handleSaveApply: function(ev) {
        return this.super('handleSaveApply', [ev]);
    }
});
