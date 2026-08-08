#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
node tests/test_model.js
python3 -m unittest discover -s tests -p 'test_*.py' -v
node --check htdocs/luci-static/resources/timecontrol-native/model.js
node --check htdocs/luci-static/resources/view/timecontrol-native/rules.js
printf '%s\n' 'all tests: PASS'
