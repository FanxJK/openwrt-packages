# Architecture

## Data model

The application intentionally has no private UCI configuration. Its only data source is the standard `firewall` UCI package. Managed sections are anonymous `config rule` sections whose names begin with `TimeControl: `.

Using a name prefix avoids adding unknown custom options that would make firewall4 emit warnings.

## Execution path

```text
LuCI form
  └─ UCI firewall rule
       └─ ucitrack invokes /etc/init.d/firewall reload
            └─ firewall4 renders one atomic nftables transaction
                 ├─ ether saddr
                 ├─ meta hour
                 └─ meta day
```

There is no backend process between configuration and firewall4.

## Device identity

The form uses one “Device information” selector keyed by MAC address. LuCI host hints enrich each option with the device name and current IP, but these are presentation data only. Candidates are filtered against the selected source zone's runtime IPv4 prefixes obtained from the read-only `network.interface dump` RPC. For example, `src=lan` only shows addresses inside LAN prefixes and excludes Docker, EasyTier and host hints without a current IPv4 address. Changing the source zone refreshes the selector immediately.

Saving writes `src_mac` and explicitly removes any legacy `src_ip`, so DHCP address changes cannot turn the rule into a stale IP-and-MAC conjunction.

An existing managed MAC that is temporarily absent from host hints remains selectable by its saved name and MAC. MAC matching requires the forwarding path to expose the original source layer-2 address; routed or relayed topologies that rewrite it need separate validation.

## Why blocked periods

A standard firewall traffic rule is active while its time expression matches. Expressing a blocked period maps directly to one native `REJECT` or `DROP` rule. An allowed-period product would require generating the complement of the schedule, often as multiple rules, and would no longer be a one-form-row-to-one-firewall-rule editor.

## Time behavior

- Empty `start_time` and `stop_time`: all day; firewall4 emits no hour match.
- `start_time < stop_time`: same-day interval.
- `start_time > stop_time`: nftables cyclic hour interval crossing midnight.
- `start_time == stop_time`: rejected by the UI.
- Empty `weekdays`: every calendar day.
- Non-empty `weekdays`: current local calendar day of each packet.

## Security model

The rpcd ACL grants read/write access only to the `firewall` UCI configuration plus read-only access to the `network.interface dump` method used for source-zone prefix discovery. It grants no command execution, arbitrary file access or service-control RPC. LuCI's normal apply/ucitrack mechanism reloads firewall4.

## Known native limitation

The standard firewall4 forwarding path accepts established/related connections before zone traffic rules. Existing conntrack and flow-offloaded sessions can therefore outlive a schedule boundary. Fixing this requires either an earlier custom rule placement or an event-driven connection cleanup mechanism; both are deliberately outside this zero-daemon application.
