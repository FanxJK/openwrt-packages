# luci-app-timecontrol-native

A daemon-free LuCI application for scheduling device Internet access with standard firewall4 traffic rules.

## Features

- Stores schedules as ordinary `config rule` sections in `/etc/config/firewall`.
- Uses firewall4 and native nftables time expressions; no background daemon, polling loop, custom nftables table, or custom chain.
- Identifies devices by MAC address. Host name and current IPv4 address are display-only, so DHCP address changes do not invalidate a rule.
- Filters device choices to current IPv4 addresses in the selected source zone to avoid unrelated host hints.
- Supports IPv4 and IPv6 traffic through an address-family-agnostic MAC rule.
- Supports all-day schedules, same-day time ranges, and overnight ranges that apply every day.
- Reloads firewall4 through LuCI's normal UCI apply flow.

## Rule behavior

Each entry is a standard firewall4 traffic rule. For example:

```uci
config rule
        option name 'TimeControl: iPad'
        option enabled '1'
        option src 'lan'
        option dest 'wan'
        option proto 'all'
        option family 'any'
        option src_mac '02:11:22:33:44:55'
        option weekdays 'Mon Tue Wed Thu Fri'
        option start_time '08:00:00'
        option stop_time '22:00:00'
        option target 'REJECT'
```

- The selected MAC address is the only device match condition.
- An empty weekday selection means every day.
- With every day selected, a range such as `22:00-07:00` is treated as overnight.
- Specific weekdays require a same-day time range. The app rejects overnight ranges with a partial weekday selection because one firewall4 rule cannot express the required next-day weekday shift correctly.
- New rules default to an all-day block. Disable **All day** to configure a time range.
- `REJECT` and `DROP` are available actions.

## Limitations

firewall4 accepts established and related connections before normal zone traffic rules. Existing conntrack or flow-offloaded sessions can therefore continue across a schedule boundary until the client reconnects. New connections are evaluated against the current schedule.

MAC matching requires the forwarding path to preserve the source Ethernet address. Routed or relayed topologies that rewrite the source MAC require separate validation.

## License

Apache-2.0
