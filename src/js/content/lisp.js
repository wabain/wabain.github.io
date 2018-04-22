// Entity declaration
let ident = 0

const HOST1_1 = ident++
const HOST1_2 = ident++
const HOST1_3 = ident++

const HOST2_1 = ident++
const HOST2_2 = ident++
const HOST2_3 = ident++

const HOST3_1 = ident++
const HOST3_2 = ident++
const HOST3_3 = ident++

const XTR1 = ident++
const XTR2 = ident++
const XTR3 = ident++
const MSMR = ident++
const PXTR = ident++

// Styling
const T_HOST = ident++
const T_XTR = ident++
const T_PXTR = ident++
const T_MSMR = ident++

const YELLOW = '#f2b632'
const YELLOW_TRANSPARENT = 'rgba(242, 182, 50, 0)'
const LIGHT_BLUE = '#5076be'
const LIGHT_BLUE_TRANSPARENT = 'rgba(80, 118, 190, 0)'
const DARK_BLUE = '#243f71'

const STYLES = {
    [T_HOST]: { d: 15, c: YELLOW },
    [T_XTR]: { d: 25, c: LIGHT_BLUE },
    [T_PXTR]: { d: 38, c: LIGHT_BLUE },
    [T_MSMR]: { d: 25, c: DARK_BLUE },
}

// Positioning
const AREA_WIDTH = 320
const AREA_HEIGHT = 275

const ENTITIES = {
    // Site 1
    [XTR1]: { t: T_XTR, x: 208, y: 116 },
    [HOST1_1]: { t: T_HOST, x: 288, y: 34 },
    [HOST1_2]: { t: T_HOST, x: 228, y: 67 },
    [HOST1_3]: { t: T_HOST, x: 273, y: 94 },

    // Site 2
    [XTR2]: { t: T_XTR, x: 186, y: 175 },
    [HOST2_1]: { t: T_HOST, x: 266, y: 205 },
    [HOST2_2]: { t: T_HOST, x: 273, y: 247 },
    [HOST2_3]: { t: T_HOST, x: 209, y: 213 },

    // Site 3
    [XTR3]: { t: T_XTR, x: 59, y: 160 },
    [HOST3_1]: { t: T_HOST, x: 57, y: 208 },
    [HOST3_2]: { t: T_HOST, x: 30, y: 231 },
    [HOST3_3]: { t: T_HOST, x: 15, y: 193 },

    // CP + border
    [PXTR]: { t: T_PXTR, x: 15, y: 46 },
    [MSMR]: { t: T_MSMR, x: 117, y: 84 },
}

// FIXME
for (const entity of Object.values(ENTITIES)) {
    entity.x += Math.floor(STYLES[entity.t].d / 2)
    entity.y += Math.floor(STYLES[entity.t].d / 2)
}

const AREAS = [
    [XTR1, HOST1_1, HOST1_2, HOST1_3],
    [XTR2, HOST2_1, HOST2_2, HOST2_3],
    [XTR3, HOST3_1, HOST3_2, HOST3_3],
    [XTR1, XTR2, XTR3, MSMR, PXTR],
]


export class LispAnimation {
    constructor({ canvas }) {
        this._canvas = canvas
        this._ctx = canvas.getContext('2d')
        this._bezierCtlPoints = selectBezierCtlPoints()
        this._pendingFlows = []
        this._transitPackets = []
        this._renderBound = () => { this._render() }

        canvas.width = AREA_WIDTH
        canvas.height = AREA_HEIGHT

        this._renderBase()

        setInterval(() => {
            for (const [areaIdx, area] of AREAS.entries()) {
                const id1 = area[Math.floor(Math.random() * area.length)]
                const id2 = area[Math.floor(Math.random() * area.length)]
                if (id1 === id2) continue

                this.startBurst({
                    area: areaIdx,
                    start: id1,
                    end: id2,
                    size: 5 + Math.floor(Math.random() * 10),
                })
            }
        }, 1000)
    }

    startBurst(params) {
        const sendOffsets = [0]

        for (let i = 1; i < params.size; i++) {
            const y = Math.floor(Math.pow(Math.random() * 2 - 1, 2) * 800)
            sendOffsets.push(y)
        }

        sendOffsets.sort((a, b) => a - b)

        const flow = {
            params,
            sendOffsets,
            time: {
                start: performance.now()
            },
        }
        this._pendingFlows.push(flow)

        if (this._transitPackets.length === 0) {
            this.requestRender()
        }
    }

    requestRender() {
        requestAnimationFrame(this._renderBound)
    }

    _render() {
        this._ctx.clearRect(0, 0, AREA_WIDTH, AREA_HEIGHT)

        const now = performance.now()

        for (const flow of this._pendingFlows) {
            this._emitPackets(flow, now)
        }

        this._transitPackets = this._transitPackets.filter((entry) => this._renderSend(entry, now))

        this._renderBase()

        if (this._transitPackets.length > 0 || this._pendingFlows.length > 0) {
            this.requestRender()
        }
    }

    _emitPackets(flow, now) {
        const { time: { start: startTime }, sendOffsets } = flow

        const currentOffset = now - startTime

        let i = 0
        for (; i < sendOffsets.length; i++) {
            if (sendOffsets[i] > currentOffset) {
                break
            }

            this._emitPacket(flow.params, now - (currentOffset - sendOffsets[i]))
        }

        if (i === sendOffsets.length) {
            const idx = this._pendingFlows.indexOf(flow)
            if (idx >= 0) {
                this._pendingFlows.splice(idx, 1)
            }
        } else if (i > 0) {
            sendOffsets.splice(0, i)
        }
    }

    _emitPacket(params, startTime) {
        const MS_PER_PIXEL = 10
        const BEZIER_CTL_VARY = 5

        const { area, start, end } = params
        const { x: x1, y: y1 } = ENTITIES[start]
        const { x: x2, y: y2 } = ENTITIES[end]

        const [[cp1x, cp1y], [cp2x, cp2y]] = this._getBezierCtlPoints(area, start, end)

        function pickInt(start, end) {
            return start + Math.floor(Math.random() * (end - start))
        }

        this._transitPackets.push({
            params,
            time: {
                total: pythagoras(x1 - x2, y1 - y2) * MS_PER_PIXEL,
                start: startTime,
            },
            path: {
                start: [x1, y1],
                end: [x2, y2],
                ctl: [
                    [
                        cp1x + pickInt(-BEZIER_CTL_VARY, BEZIER_CTL_VARY),
                        cp1y + pickInt(-BEZIER_CTL_VARY, BEZIER_CTL_VARY),
                    ],
                    [
                        cp2x + pickInt(-BEZIER_CTL_VARY, BEZIER_CTL_VARY),
                        cp2y + pickInt(-BEZIER_CTL_VARY, BEZIER_CTL_VARY),
                    ],
                ],
            },
        })

        console.log('total time', pythagoras(x1 - x2, y1 - y2) * MS_PER_PIXEL)
    }

    _renderSend(entry, now) {
        const funcPoint = (now - entry.time.start) / entry.time.total

        if (funcPoint > 1) {
            return false
        }

        const [x, y] = getCubicBezierPoint(funcPoint, entry.path.start, ...entry.path.ctl, entry.path.end)
        const tailPoint = Math.max(funcPoint - 0.05, 0)
        const [tx, ty] = getCubicBezierPoint(tailPoint, entry.path.start, ...entry.path.ctl, entry.path.end)

        const ctx = this._ctx

        const gradient = ctx.createLinearGradient(x, y, tx, ty)
        gradient.addColorStop(0, entry.params.area === 3 ? LIGHT_BLUE : YELLOW)
        gradient.addColorStop(1, entry.params.area === 3 ? LIGHT_BLUE_TRANSPARENT : YELLOW_TRANSPARENT)

        ctx.save()

        ctx.beginPath()

        ctx.strokeStyle = gradient
        ctx.lineWidth = 2

        ctx.moveTo(x, y)
        ctx.lineTo(tx, ty)
        ctx.stroke()

        ctx.restore()

        return true
    }

    _renderBase() {
        const ctx = this._ctx

        for (const { t, x, y } of Object.values(ENTITIES)) {
            const { d, c } = STYLES[t]
            ctx.beginPath()
            ctx.fillStyle = c

            const r = Math.floor(d / 2)
            ctx.arc(x, y, r, 0, Math.PI * 2, true)

            ctx.fill()
        }

        // this._drawTravelCurves()
    }

    _drawTravelCurves() {
        const ctx = this._ctx

        for (const [areaIdx, area] of AREAS.entries()) {
            for (const [idx, id1] of area.entries()) {
                for (const id2 of area.slice(idx + 1)) {
                    const [[cp1x, cp1y], [cp2x, cp2y]] = this._getBezierCtlPoints(areaIdx, id1, id2)

                    const { x: x1, y: y1 } = ENTITIES[id1]
                    const { x: x2, y: y2 } = ENTITIES[id2]

                    ctx.moveTo(x1, y1)
                    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x2, y2)
                }
            }
            ctx.stroke()
        }
    }

    _getBezierCtlPoints(areaIdx, id1, id2) {
        const curveKey = `${areaIdx}:${Math.min(id1, id2)}:${Math.max(id1, id2)}`
        return this._bezierCtlPoints[curveKey]
    }
}

function selectBezierCtlPoints() {
    const ctlPoints = {}

    for (const [areaIdx, area] of AREAS.entries()) {
        for (const [idx, id1] of area.entries()) {
            for (const id2 of area.slice(idx + 1)) {
                const { x: x1, y: y1 } = ENTITIES[id1]
                const { x: x2, y: y2 } = ENTITIES[id2]

                const otherPoints = area
                    .filter((id) => [id1, id2].indexOf(id) < 0)
                    .map((id) => ([ENTITIES[id].x, ENTITIES[id].y]))

                const cp1 = getControlPoint([x1, y1], otherPoints)
                const cp2 = getControlPoint([x2, y2], otherPoints)

                ctlPoints[`${areaIdx}:${Math.min(id1, id2)}:${Math.max(id1, id2)}`] = [cp1, cp2]
            }
        }
    }

    return ctlPoints
}

function getCubicBezierPoint(t, [p0x, p0y], [cp1x, cp1y], [cp2x, cp2y], [p3x, p3y]) {
    const x = (1-t)*(1-t)*(1-t)*p0x + 3*(1-t)*(1-t)*t*cp1x + 3*(1-t)*t*t*cp2x + t*t*t*p3x
    const y = (1-t)*(1-t)*(1-t)*p0y + 3*(1-t)*(1-t)*t*cp1y + 3*(1-t)*t*t*cp2y + t*t*t*p3y
    return [x, y]
}

function getControlPoint([x, y], avoidPoints) {
    const relevantPoints = [
        // [0, y],
        // [AREA_WIDTH, y],
        // [x, 0],
        // [x, AREA_HEIGHT],
        ...avoidPoints,
    ]

    const closestPoints = getTwoClosestPoints([x, y], relevantPoints)
    return getTriangleMidpoint([x, y], ...closestPoints)
}

function getTwoClosestPoints([x, y], candidates) {
    const distances = candidates.map(([x2, y2]) => [pythagoras(x2 - x, y2 - y), [x2, y2]])
    distances.sort((a, b) => a[0] - b[0])

    const [[, p1], [, p2]] = distances
    return [p1, p2]
}

function pythagoras(x, y) {
    return Math.sqrt(Math.pow(x, 2) + Math.pow(y, 2))
}

function getTriangleMidpoint([x1, y1], [x2, y2], [x3, y3]) {
    return [(x1 + x2 + x3) / 3, (y1 + y2 + y3) / 3]
}
