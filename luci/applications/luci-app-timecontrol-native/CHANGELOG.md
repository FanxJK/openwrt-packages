# Changelog

## 0.1.3 - 2026-08-08

- Make new rules default to an explicit “All day” mode that omits `start_time` and `stop_time`.
- Show custom start and stop fields only when “All day” is disabled.
- Filter device candidates to current IPv4 addresses inside the selected source zone.
- Refresh device choices when the source zone changes and remove address-less unknown host hints.
- Add only the read-only `network.interface dump` RPC permission required for zone-prefix discovery.

## 0.1.2 - 2026-08-08

- Make MAC the sole active device identity and firewall4 match condition.
- Show device name, current IP and MAC together in one “Device information” selector.
- Remove duplicate read-only device fields and delete legacy `src_ip` when saving.
- Restrict the migration helper to legacy period rules with a MAC target.
- Document MAC-only matching and layer-2 visibility limitations.

## 0.1.1 - 2026-08-08

- Select a single device IP and automatically bind its host name and MAC address.
- Show device name and MAC as read-only values instead of duplicate selectors.
- Improve the FIREWALL4 policy label contrast and hero-card visual hierarchy.
- Complete Simplified Chinese coverage for every visible LuCI string while keeping technical terms in English.

## 0.1.0 - 2026-08-08

- Initial independent implementation.
- Store schedules as standard firewall4 traffic rules.
- Use native nftables hour and weekday expressions.
- Display device IPv4 and MAC as separate conditions.
- Support native overnight ranges.
- Add responsive LuCI interface and minimal rpcd ACL.
- Add dry-run/apply/rollback migration for supported legacy period rules, preserving legacy IP-or-MAC behavior by splitting targets.
- Add reproducible ImmortalWrt 25.12.1 SDK and GitHub Release APK build workflows.
- Remove daemon, polling, custom nft chains and legacy iptables paths.
