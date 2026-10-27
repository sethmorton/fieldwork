#!/usr/bin/env python3
"""Offline check of sprint_stakes.area_codes and duel_cost: WORLD_PACK_DATA=<caches> python3 tools/world-pack/test_sprint_stakes.py
(the data folder only for imports; no network)."""
import datetime as dt

from sprint_stakes import area_codes, duel_cost

rounds = [{'countryCode': 'US', 'subdivision': s} for s in
          ('Virginia (US-VA)', 'West Virginia (US-WV)', 'Massachusetts (US-MA)', 'Rhode Island (US-RI)')] + \
         [{'countryCode': 'CA', 'subdivision': 'Quebec (CA-QC)'}, {'countryCode': 'US', 'subdivision': None}]
assert area_codes('West Virginia', 'US', rounds) == ['US-WV']
assert sorted(area_codes('Eastern Massachusetts, Rhode Island', 'US', rounds)) == ['US-MA', 'US-RI']
assert area_codes('Québec', 'CA', rounds) == ['CA-QC']
assert area_codes('Pacific Northwest', 'US', rounds) == []

now = dt.datetime(2026, 10, 27, 22, tzinfo=dt.timezone.utc)
lost = {'myScore': 1000, 'theirScore': 3000, 'endTime': '2026-10-27T21:30:00+00:00'}
assert duel_cost(lost, True, now) == (6000, True)  # a mistake from the last 12 h: boosted, recent
assert duel_cost(lost, False, now) == (2000, False)  # right country, close: plain deficit
assert duel_cost(lost | {'endTime': '2026-10-27T05:00:00+00:00'}, True, now) == (2000, False)  # the previous sitting
assert duel_cost(lost | {'myScore': 4000}, True, now) == (0, True)  # won the round anyway
print('ok')
