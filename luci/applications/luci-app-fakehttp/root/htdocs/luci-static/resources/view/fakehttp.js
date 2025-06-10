"use strict";
'require view';
'require form';
'require uci';
'require tools.widgets as widgets';
'require fs';

return view.extend({
    render: function() {
        var m = new form.Map('fakehttp', 'FakeHTTP 服务',
            '用法: <a href="https://github.com/MikeWang000000/FakeHTTP/wiki" target="_blank">https://github.com/MikeWang000000/FakeHTTP/wiki</a>'
        );
        var s = m.section(form.NamedSection, 'main', 'fakehttp');
        s.anonymous = true;

        s.option(form.Flag, 'enabled', '启用');

        var o = s.option(form.Value, 'host', '用于混淆的主机名 (-h)');
        o.default = 'speedtest.cn';
        o.rmempty = false;

        var i = s.option(widgets.NetworkSelect, 'iface', '网络接口名称 (-i)');
        i.rmempty = false;

        var mopt = s.option(form.Value, 'mark', 'fwmark 标记 (-m)');
        mopt.datatype = 'uinteger';
        mopt.rmempty = true;

        var nopt = s.option(form.Value, 'num', '队列编号 (-n)');
        nopt.datatype = 'uinteger';
        nopt.rmempty = true;

        var ropt = s.option(form.Value, 'repeat', '重复次数 (-r)');
        ropt.datatype = 'uinteger';
        ropt.rmempty = true;

        var topt = s.option(form.Value, 'ttl', 'TTL 值 (-t)');
        topt.datatype = 'uinteger';
        topt.rmempty = true;

        var xopt = s.option(form.Value, 'mask', 'fwmark 掩码 (-x)');
        xopt.datatype = 'uinteger';
        xopt.rmempty = true;

        s.on('save', function() {
            uci.save();
        });
        s.on('apply', function() {
            return fs.exec('/etc/init.d/fakehttp', ['restart']);
        });

        return m.render();
    }
}); 