# Contributing

1. Open an issue describing the behavior change.
2. Add or update a failing test first.
3. Keep runtime dependencies limited to `luci-base` and `firewall4` unless there is a documented architectural reason.
4. Do not add background polling, custom nftables tables, iptables branches or unrestricted rpcd ACLs.
5. Run `./tests/run.sh` before submitting a pull request.

Commits should be focused and use an imperative subject, for example:

```text
rules: validate equal start and stop times
```
