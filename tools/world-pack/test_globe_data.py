#!/usr/bin/env python3
"""Offline check of globe_data's geometry and ranking: python3 tools/world-pack/test_globe_data.py (no data needed)."""
import globe_data as g
import globe_geometry as geo

# A square with a bump far below tolerance simplifies to its 4 corners; a big bump survives.
square = [[0, 0], [1, 0], [1, 0.5], [1.001, 0.6], [1, 1], [0, 1], [0, 0]]
assert len(geo.simplify_ring(square, 0.01)) == 5, geo.simplify_ring(square, 0.01)
assert [1.5, 0.5] in geo.simplify_ring([[0, 0], [1, 0], [1.5, 0.5], [1, 1], [0, 1], [0, 0]], 0.01)

# d3 winding whatever the input's: outer rings clockwise (signed area < 0), holes counter-clockwise.
ccw = [[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]]
hole = [[1, 1], [1, 3], [3, 3], [3, 1], [1, 1]]
outer, inner = geo.simplify_polys([[ccw, hole]], 0.01, 3)[0]
assert geo.area(outer, True) < 0 < geo.area(inner, True)

# Even-odd point-in-polygon honours holes.
donut = [[[[0, 0], [4, 0], [4, 4], [0, 4]], [[1, 1], [3, 1], [3, 3], [1, 3]]]]
assert geo.inside(0.5, 0.5, donut) and not geo.inside(2, 2, donut) and not geo.inside(5, 5, donut)

# Cards by cost, then subject; guides after all cards, shortest first.
metas = {'a': {'kind': 'guide', 'tell': 'long tip text'}, 'b': {'kind': 'guide', 'tell': 'short'},
         'c': {'kind': 'card', 'cost': 100, 'subject': 'duel'}, 'd': {'kind': 'card', 'cost': 100, 'subject': 'poles'},
         'e': {'kind': 'card', 'cost': 900, 'subject': 'car'}}
assert sorted(metas, key=lambda k: g.rank_key(metas[k])) == ['e', 'd', 'c', 'b', 'a']

# Regions: poles first, signs last, narrower first; a tell restating a kept one is dropped.
metas = {'s': {'subject': 'signs', 'regions': ['X'], 'cost': 9, 'tell': 'Blue signs'},
         'p': {'subject': 'poles', 'regions': ['X', 'Y'], 'cost': 0, 'tell': 'Trident style pole tops -> Java'},
         'q': {'subject': 'poles', 'regions': ['X'], 'cost': 0, 'tell': 'Trident-style pole tops are found in Java'}}
assert g.dedupe(sorted(metas, key=lambda k: g.region_key(metas[k])), metas, 16) == ['q', 's']
print('ok')
