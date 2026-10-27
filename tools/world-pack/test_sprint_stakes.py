#!/usr/bin/env python3
"""Offline check of sprint_stakes.area_codes: WORLD_PACK_DATA=<caches> python3 tools/world-pack/test_sprint_stakes.py
(the data folder only for imports; no network)."""
from sprint_stakes import area_codes

rounds = [{'countryCode': 'US', 'subdivision': s} for s in
          ('Virginia (US-VA)', 'West Virginia (US-WV)', 'Massachusetts (US-MA)', 'Rhode Island (US-RI)')] + \
         [{'countryCode': 'CA', 'subdivision': 'Quebec (CA-QC)'}, {'countryCode': 'US', 'subdivision': None}]
assert area_codes('West Virginia', 'US', rounds) == ['US-WV']
assert sorted(area_codes('Eastern Massachusetts, Rhode Island', 'US', rounds)) == ['US-MA', 'US-RI']
assert area_codes('Québec', 'CA', rounds) == ['CA-QC']
assert area_codes('Pacific Northwest', 'US', rounds) == []
print('ok')
