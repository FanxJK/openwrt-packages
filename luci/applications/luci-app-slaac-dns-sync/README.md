# luci-app-slaac-dns-sync

OpenWrt 25.12 LuCI application for publishing local AAAA records from pure-SLAAC clients without enabling DHCPv6.

## How it works

`rpcd-mod-luci` already correlates DHCPv4/static host names and NDP neighbors through `luci-rpc.getHostHints`. This package periodically renders the resulting named ULA/GUA addresses into `/tmp/hosts/slaac-dns-sync` and reloads dnsmasq only when the content changes.

The LuCI page is available under **Services → SLAAC DNS Sync** and provides:

- a master enable/disable switch;
- live procd service status and generated record count;
- one-click manual synchronization;
- ULA/GUA selection policy;
- local domain and interval settings;
- optional host allowlist/denylist;
- generated record preview.

## Runtime dependencies

- `luci-base`
- `rpcd-mod-luci`
- `ucode`
- dnsmasq configured with `ignore_hosts_dir=0` and without AAAA filtering

## Build in an OpenWrt 25.12 SDK

Copy this directory under `package/` or add it through a custom feed, then run:

```sh
make defconfig
make package/luci-app-slaac-dns-sync/compile V=s
```

The package is architecture-independent (`all`).

## Install

The locally built APK is unsigned unless your SDK/build pipeline signs it. Install an unsigned build with:

```sh
apk add --allow-untrusted ./luci-app-slaac-dns-sync-1.0.0-r1.apk
```

Then clear the browser cache or sign out/in if the menu is not immediately visible.

## Important limitation

Router-side NDP cannot reliably distinguish RFC 7217 stable privacy addresses from RFC 4941 temporary addresses. For servers, prefer a stable ULA and use the host allowlist.
