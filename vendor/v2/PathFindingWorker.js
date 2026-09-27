(function() {
	const PATH_FINDING_WORKER_BUILD = "20260924-v2-navigation-worker-1";
	var t = class {
		constructor() {
			this.values = [];
		}
		enqueue(t, e) {
			this.values.push({
				val: t,
				priority: e
			}), this.sort();
		}
		dequeue() {
			return this.values.shift();
		}
		sort() {
			this.values.sort((t, e) => t.priority - e.priority);
		}
	};
	function e(t, e) {
		return t + "," + e;
	}
	function s(t, e, s, n) {
		const r = Math.abs(t - s), a = Math.abs(e - n);
		return Math.max(r, a);
	}
	function n(t, e, n, r) {
		const a = [], o = [
			[0, 1],
			[1, 0],
			[0, -1],
			[-1, 0]
		];
		for (let s = 0; s < o.length; s++) {
			const r = t + o[s][0], i = e + o[s][1];
			r < 0 || r >= n.width || i < 0 || i >= n.height || n.cellTypes[r + i * n.width] & n.walkableType && a.push({
				x: r,
				y: i,
				isWarp: !1,
				cost: 1
			});
		}
		if (r) for (const i of r) s(t, e, i.srcX, i.srcY) <= 1 && a.push({
			x: i.destX,
			y: i.destY,
			isWarp: !0,
			warpId: i.id,
			cost: 1
		});
		return a;
	}
	self.onmessage = function(r) {
		const a = r.data;
		switch (a.type) {
			case "findPath": {
				const r = function(r, a, o, i, h, u) {
					if (r = Math.floor(r), a = Math.floor(a), o = Math.floor(o), i = Math.floor(i), r === o && a === i) return [];
					if (!(h.cellTypes[o + i * h.width] & h.walkableType)) return [];
					if (u && u.length > 0 && u[u.length - 1].x === o && u[u.length - 1].y === i) {
						const index = u.findIndex((point) => point.x === r && point.y === a);
						if (index >= 0) return u.slice(index);
					}
					// Recompute if the player left the cached route or changed target.
					u = [];
					const l = /* @__PURE__ */ new Map();
					if (u && u.length > 0) for (let t = 0; t < u.length; t++) {
						const s = u[t];
						l.set(e(s.x, s.y), t);
					}
					const f = new t(), c = /* @__PURE__ */ new Set(), p = /* @__PURE__ */ new Map(), y = /* @__PURE__ */ new Map(), d = /* @__PURE__ */ new Map(), g = e(r, a);
					f.enqueue([r, a], 0), y.set(g, 0), d.set(g, s(r, a, o, i));
					const w = h.warps || [], x = u && u.length > 0 ? Math.floor(.25 * u.length) : 0;
					for (; f.values.length > 0;) {
						const t = f.dequeue().val, g = t[0], M = t[1], v = e(g, M);
						if (g === o && M === i) {
							const t = [{ x: o, y: i }];
							let s = v;
							for (; p.has(s);) {
								const [n, r, a, o] = p.get(s);
								t.unshift({
									x: parseInt(n),
									y: parseInt(r),
									isWarp: a,
									warpId: o
								}), s = e(n, r);
							}
							return t;
						}
						if (l.has(v) && l.get(v) >= x) {
							const t = l.get(v), s = [];
							let n = v;
							for (; p.has(n);) {
								const [t, r, a, o] = p.get(n);
								s.unshift({
									x: parseInt(t),
									y: parseInt(r),
									isWarp: a,
									warpId: o
								}), n = e(t, r);
							}
							if (s.unshift({
								x: r,
								y: a
							}), t < u.length - 1) for (let e = t + 1; e < u.length; e++) s.push(u[e]);
							return s;
						}
						c.add(v);
						const I = n(g, M, h, w);
						for (const n of I) {
							const t = e(n.x, n.y);
							if (c.has(t)) continue;
							const r = y.get(v) + n.cost;
							if (f.values.some((s) => e(s.val[0], s.val[1]) === t)) {
								if (r >= y.get(t)) continue;
							} else f.enqueue([n.x, n.y], r + s(n.x, n.y, o, i));
							p.set(t, [
								g,
								M,
								n.isWarp,
								n.warpId
							]), y.set(t, r), d.set(t, r + s(n.x, n.y, o, i));
						}
					}
					return [];
				}(a.startX, a.startY, a.endX, a.endY, a.mapData, a.existingPath);
				self.postMessage({
					type: "pathResult",
					path: r,
					requestId: a.requestId,
					workerId: a.workerId,
					workerBuild: PATH_FINDING_WORKER_BUILD
				});
				break;
			}
		}
	};
})();
