# luci-app-timecontrol-native

A daemon-free LuCI application for device Internet schedules using **native firewall4 traffic rules**.

[中文说明](#中文) · [English](#english)

## 中文

### 设计目标

本项目不是 `sirpdboy/luci-app-timecontrol` 的补丁或分支，而是重新设计的独立项目：

- 不创建私有 nftables 表或链；
- 不运行常驻守护进程；
- 不每分钟轮询；
- 不包含不可达的 iptables 兼容分支；
- 不依赖 Bash、bc 或 conntrack 工具；
- 直接读写 `/etc/config/firewall` 中的标准 `config rule`；
- 由 firewall4 原子编译为 nftables `meta hour`、`meta day` 和 `ether saddr` 表达式。

运行依赖只有：

```text
luci-base
firewall4
```

### 规则语义

每条设备规则会成为普通 firewall4 通信规则：

```uci
config rule
        option name 'TimeControl: iPad'
        option enabled '1'
        option src 'lan'
        option dest 'wan'
        option family 'ipv4'
        option proto 'all'
        option src_mac '02:11:22:33:44:55'
        option weekdays 'Mon Tue Wed Thu Fri'
        option start_time '22:00:00'
        option stop_time '07:00:00'
        option target 'REJECT'
```

firewall4 在目标平台生成类似规则：

```nft
ether saddr 02:11:22:33:44:55 \
meta hour "22:00:00"-"07:00:00" \
meta day { "Monday", "Tuesday", "Wednesday", "Thursday", "Friday" } reject
```

- 新增规则默认“全天”，通过不写入 `start_time` 和 `stop_time` 表示，不使用没有通用意义的预设时间段。
- 关闭“全天”后才会显示并写入自定义开始、结束时间；`22:00–07:00` 等范围由 nftables 原生处理为跨午夜范围。
- 界面中的“设备信息”以 MAC 为主动选择值，选项同时展示设备名称、当前 IP 和 MAC。
- 设备候选按所选源区域的运行时 IPv4 网段过滤；例如选择 `lan` 时不会混入 Docker、EasyTier 地址，也不会显示没有当前 IP 的未知 host hint。
- 保存时只写入 `src_mac`；当前 IP 仅来自 LuCI host hints，用于展示，不参与 firewall4 匹配，因此 DHCP 地址变化不会使规则失效。
- 未选择星期表示每天。
- 星期和小时使用路由器本地时区，并按数据包发生时的自然日判断。
- 目标 ImmortalWrt 25.12.1 会解析 `utc_time`，但其 firewall4 nft 模板未使用该值；实测开关前后 `fw4 print` 完全相同，因此首版不暴露一个无效的 UTC 开关。
- 开始和结束时间不能相同。

### 原生方案的边界

firewall4 的标准通信规则位于既有连接处理之后。因此规则到达时间边界时：

- 新建连接会被时间规则拒绝；
- 已建立的 conntrack 或流量卸载连接可能继续到重新连接；
- 本项目故意不运行定时器，也不会在边界主动删除连接。
- MAC 匹配依赖 firewall4 在当前转发路径上能看到源二层地址；跨路由、部分中继或其他不保留源 MAC 的网络拓扑需要另行验证。

如果业务必须在整点强制踢下线，需要一个额外的事件调度/conntrack 清理组件，这不属于本项目的“纯原生、零守护进程”目标。

### 安装

从 Release 下载主包与可选中文包后：

```sh
apk add --allow-untrusted /tmp/luci-app-timecontrol-native-*.apk
apk add --allow-untrusted /tmp/luci-i18n-timecontrol-native-zh-cn-*.apk
rm -f /tmp/luci-indexcache /tmp/luci-modulecache/*
/etc/init.d/rpcd reload
/etc/init.d/uhttpd reload
```

然后进入：**管控 → Native Time Control**。

### 从旧版安全迁移

迁移工具不会自动运行。它只迁移“每天、固定时段”且具有 MAC 的旧规则；`duration`、仅 IP 等不符合 MAC-only 模型的规则会被明确拒绝。旧配置中的 IP 会被忽略，生成的规则只使用 MAC，避免 DHCP 地址变化后失效。

```sh
timecontrol-native-migrate --dry-run
timecontrol-native-migrate --apply
# 验证不符合预期时：
timecontrol-native-migrate --rollback
```

`--apply` 会先保存 `/etc/config/firewall.before-timecontrol-native-migration`，提交后运行 `fw4 check`，只有检查通过才 reload firewall。请在验证完成前保留该备份。迁移确认无误后，再停用或卸载旧应用，避免两个实现同时生效。

### 源码构建

将项目放入 OpenWrt/ImmortalWrt SDK 的 `package/` 目录：

```sh
ln -s "$PWD" /path/to/sdk/package/luci-app-timecontrol-native
cd /path/to/sdk
./scripts/feeds update luci
make -C feeds/luci/modules/luci-base/src clean po2lmo jsmin
cp feeds/luci/modules/luci-base/src/po2lmo \
   feeds/luci/modules/luci-base/src/jsmin staging_dir/host/bin/
make defconfig
make package/luci-app-timecontrol-native/compile V=s
```

### 已验证平台

- ImmortalWrt 25.12.1
- target: `rockchip/armv8`
- SDK package target: `aarch64_generic`; generated LuCI APK: `noarch`
- firewall4 `2025.03.17~b6e51575-r2`
- nftables `1.1.6`

真实探针已确认 `meta hour` 和 `meta day` 使用路由器本地时间，且 `22:00–07:00` 的循环范围在凌晨可以命中。

## English

This package is a clean LuCI editor for native firewall4 timed traffic rules. It has no daemon, no polling loop, no custom nftables table and no iptables compatibility branch. Users select a device by MAC address, while LuCI host hints display its name and current IP in the same selector. Device candidates are limited to current IPv4 addresses inside the selected source zone, so `lan` does not include Docker, EasyTier or address-less host hints. New rules default to all day by omitting `start_time` and `stop_time`; custom ranges use native `meta hour`. The current IP is display-only; firewall4 matches only `src_mac` together with optional native time expressions.

See the Chinese section above for exact matching semantics, installation, limitations and build instructions.

## Development

```sh
./tests/run.sh
```

See [CONTRIBUTING.md](CONTRIBUTING.md) and [ARCHITECTURE.md](ARCHITECTURE.md).

## License

Apache-2.0
