#!/usr/bin/env python3
"""Offline check of acow.estimate: python3 tools/world-pack/test_acow.py (no data folder or network needed)."""
import os
import tempfile

os.environ.setdefault('WORLD_PACK_DATA', tempfile.mkdtemp())
import acow  # noqa: E402

w = {'AA': 900, 'BB': 100}
rounds = {f'AA{i}': {'countryCode': 'AA'} for i in range(4)} | {'BB0': {'countryCode': 'BB'}, 'BB1': {'countryCode': 'BB'}}
current = {'AA': 'fa', 'BB': 'fb'}
seen = lambda *tips: [{'topicId': t} for t in tips]
recs = [
    {'id': 'AA0', 'inputs': 'fa', 'clues': seen('x', 'y')},
    {'id': 'AA1', 'inputs': 'fa', 'clues': seen('x')},
    {'id': 'AA2', 'inputs': 'fa', 'clues': []},
    {'id': 'AA3', 'inputs': 'fa', 'clues': [], 'skipped': 'panorama gone'},  # not in the denominator
    {'id': 'BB0', 'inputs': 'fb', 'clues': seen('z')},
    {'id': 'BB1', 'inputs': 'old', 'clues': seen('z')},  # judged with other inputs: ignored, BB counts 1 round
    {'id': 'GONE', 'inputs': 'fa', 'clues': seen('x')},  # no longer in the sample: ignored
]
result = acow.estimate(w, rounds, recs, current)['clues']
# AA is 90% of rounds over 3 judged samples, BB 10% over 1.
assert result['x'] == {'per1000': 600.0, 'hits': 2}, result['x']
assert result['y'] == {'per1000': 300.0, 'hits': 1}, result['y']
assert result['z'] == {'per1000': 100.0, 'hits': 1}, result['z']
assert acow.estimate(w, {'AA0': rounds['AA0']}, recs, current)['countriesWithoutJudgedRounds'] == ['BB']
print('ok')
