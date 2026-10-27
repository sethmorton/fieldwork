"""Polygon helpers for globe_data.py: Douglas-Peucker as in scripts/world-geometry.mjs, d3 winding, point-in-polygon."""
import math

MIN_AREA = 0.005  # square degrees: islets and holes smaller than this are dropped


def seg_dist(p, a, b):
    dx, dy = b[0] - a[0], b[1] - a[1]
    length = dx * dx + dy * dy
    t = max(0, min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length)) if length else 0
    return math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy)


def simplify(points, tol):
    """Iterative Douglas-Peucker (big admin-1 rings overflow Python's recursion limit)."""
    keep, stack = {0, len(points) - 1}, [(0, len(points) - 1)]
    while stack:
        lo, hi = stack.pop()
        best, index = 0, 0
        for i in range(lo + 1, hi):
            d = seg_dist(points[i], points[lo], points[hi])
            if d > best:
                best, index = d, i
        if best > tol:
            keep.add(index)
            stack += [(lo, index), (index, hi)]
    return [points[i] for i in sorted(keep)]


def simplify_ring(ring, tol):
    """Closed ring: split at the point farthest from the start so no baseline has zero length."""
    far = max(range(len(ring)), key=lambda i: math.hypot(ring[i][0] - ring[0][0], ring[i][1] - ring[0][1]))
    return simplify(ring[:far + 1], tol)[:-1] + simplify(ring[far:], tol)


def area(ring, signed=False):
    s = sum(x * ny - nx * y for (x, y), (nx, ny) in zip(ring, ring[1:] + ring[:1])) / 2  # > 0: counter-clockwise
    return s if signed else abs(s)


def polygons(geometry):
    return [geometry['coordinates']] if geometry['type'] == 'Polygon' else geometry['coordinates']


def simplify_polys(polys, tol, digits):
    """Drop islets and holes under MIN_AREA (but always keep the largest polygon), simplify the rest, round."""
    largest, out = max(area(p[0]) for p in polys), []
    for poly in polys:
        if area(poly[0]) < MIN_AREA and area(poly[0]) != largest:
            continue
        rings = []
        for ring in poly[:1] + [h for h in poly[1:] if area(h) >= MIN_AREA]:
            simple = s if len(s := simplify_ring(ring, tol)) > 3 and area(s) > 1e-6 else ring  # collapsed: keep as is
            r = [[round(x, digits), round(y, digits)] for x, y in simple]
            rings.append(r if (area(r, True) < 0) == (not rings) else r[::-1])  # d3: outer clockwise, holes not
        if area(rings[0]) > 1e-6:  # zero-area rings (collinear once rounded) render inverted over the whole globe
            out.append([r for r in rings if area(r) > 1e-6])
    return out


def feature(code, name, polys):
    return {'type': 'Feature', 'properties': {'code': code, 'name': name},
            'geometry': {'type': 'MultiPolygon', 'coordinates': polys}}


def inside(lng, lat, polys):
    """Even-odd ray cast over every ring (holes included)."""
    hit = False
    for poly in polys:
        for ring in poly:
            for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]):
                if (y1 > lat) != (y2 > lat) and lng < x1 + (lat - y1) * (x2 - x1) / (y2 - y1):
                    hit = not hit
    return hit


def bbox(polys):
    xs = [x for p in polys for x, _ in p[0]]
    ys = [y for p in polys for _, y in p[0]]
    return min(xs), min(ys), max(xs), max(ys)
