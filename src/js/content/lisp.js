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
const YELLOW_SEMI_TRANSPARENT = 'rgba(242, 182, 50, 0.3)'
const YELLOW_TRANSPARENT = 'rgba(242, 182, 50, 0)'
const LIGHT_BLUE = '#5076be'
const LIGHT_BLUE_SEMI_TRANSPARENT = 'rgba(80, 118, 190, 0.3)'
const LIGHT_BLUE_TRANSPARENT = 'rgba(80, 118, 190, 0)'
const DARK_BLUE = '#243f71'

const STYLES = {
    [T_HOST]: { d: 15, c: YELLOW },
    [T_XTR]: { d: 25, c: LIGHT_BLUE },
    [T_PXTR]: { d: 38, c: LIGHT_BLUE },
    [T_MSMR]: { d: 25, c: DARK_BLUE },
}

// Positioning
const WIDTH_SCALE = 1 // XXX
const AREA_WIDTH = 320 * WIDTH_SCALE
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

for (const value of Object.values(ENTITIES)) {
    value.x *= WIDTH_SCALE
}

// {
//     const getRadius = (t) => Math.floor(STYLES[t].d / 2)

//     const minX = Math.min(...Object.values(ENTITIES).map(({ x, t }) => x - getRadius(t)))
//     const maxX = Math.max(...Object.values(ENTITIES).map(({ x, t }) => x + getRadius(t)))

//     const minY = Math.min(...Object.values(ENTITIES).map(({ y, t }) => y - getRadius(t)))
//     const maxY = Math.max(...Object.values(ENTITIES).map(({ y, t }) => y + getRadius(t)))

//     for (const value of Object.values(ENTITIES)) {
//         value.x = Math.abs((value.x - minX) * (maxX - minX) / AREA_WIDTH)
//         value.y = Math.abs((value.y - minY) * (maxY - minY) / AREA_HEIGHT)
//     }
// }

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


const SIMULATED_PACKET_MAX = 180


export class LispAnimation {
    constructor({ canvas }) {
        this._canvas = canvas
        this._ctx = canvas.getContext('2d')
        this._bezierCtlPoints = selectBezierCtlPoints()
        this._pktBuffer = new PacketBuffer()

        this._renderBound = this._render.bind(this)
        this._renderPktBound = this._renderPkt.bind(this)

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
                    size: 5 + Math.floor(Math.random() * 5),
                })
            }
        }, 1000)

        this.requestRender()
    }

    startBurst({ area, start, end, size }) {
        const MS_PER_PIXEL = 10
        const BEZIER_CTL_VARY = 5

        const { x: x1, y: y1 } = ENTITIES[start]
        const { x: x2, y: y2 } = ENTITIES[end]

        const [[cp1x, cp1y], [cp2x, cp2y]] = this._getBezierCtlPoints(area, start, end)

        const now = performance.now()
        const totalTime = pythagoras(x1 - x2, y1 - y2) * MS_PER_PIXEL

        function pickInt(start, end) {
            return start + Math.floor(Math.random() * (end - start))
        }

        for (let i = 0; i < size; i++) {
            let startDelay

            if (i === 0) {
                // Ensure at least one packet goes out immediately
                startDelay = 0
            } else {
                startDelay = Math.floor(Math.pow(Math.random() * 2 - 1, 2) * 800)
            }

            this._pktBuffer.insert(
                area === 3 ? PKT_T_RLOC : PKT_T_EID,
                now + startDelay,
                totalTime,
                x1,
                y1,
                x2,
                y2,
                cp1x + pickInt(-BEZIER_CTL_VARY, BEZIER_CTL_VARY),
                cp1y + pickInt(-BEZIER_CTL_VARY, BEZIER_CTL_VARY),
                cp2x + pickInt(-BEZIER_CTL_VARY, BEZIER_CTL_VARY),
                cp2y + pickInt(-BEZIER_CTL_VARY, BEZIER_CTL_VARY)
            )
        }
    }

    requestRender() {
        requestAnimationFrame(this._renderBound)
    }

    _render() {
        this._ctx.clearRect(0, 0, AREA_WIDTH, AREA_HEIGHT)

        const now = performance.now()
        this._renderPkts(now)

        this._renderBase()
        this.requestRender()
    }

    _renderPkts(now) {
        const buf = this._pktBuffer

        const state = buf._state

        for (let i = 0; i < SIMULATED_PACKET_MAX; i++) {
            if (state[i] !== PKT_RUNNING) {
                continue
            }

            let retain = false

            retain = this._renderPkt(
                now,
                buf._type[i],
                buf._startTime[i],
                buf._totalTime[i],
                buf._startX[i],
                buf._startY[i],
                buf._endX[i],
                buf._endY[i],
                buf._cp1x[i],
                buf._cp1y[i],
                buf._cp2x[i],
                buf._cp2y[i]
            )

            if (!retain) {
                state[i] = PKT_INACTIVE
            }
        }
    }

    _renderPkt(now, type, startTime, totalTime, startX, startY, endX, endY, cp1x, cp1y, cp2x, cp2y) {
        const funcPoint = (now - startTime) / totalTime

        // Still pending
        if (funcPoint < 0) {
            return true
        }

        if (funcPoint > 1) {
            return false
        }

        const [x, y] = getCubicBezierPoint(funcPoint, startX, startY, cp1x, cp1y, cp2x, cp2y, endX, endY)
        const midPoint = Math.max(funcPoint - 0.05, 0)
        const [x1, y1] = getCubicBezierPoint(midPoint, startX, startY, cp1x, cp1y, cp2x, cp2y, endX, endY)
        const tailPoint = Math.max(funcPoint - 0.1, 0)
        const [x2, y2] = getCubicBezierPoint(tailPoint, startX, startY, cp1x, cp1y, cp2x, cp2y, endX, endY)

        const ctx = this._ctx

        const gradient = ctx.createLinearGradient(x, y, x2, y2)
        gradient.addColorStop(0, type === PKT_T_RLOC ? LIGHT_BLUE : YELLOW)

        const headEnd = 5 / pythagoras(x - x2, y - y2)

        if (headEnd < 1) {
            gradient.addColorStop(headEnd, type === PKT_T_RLOC ? LIGHT_BLUE_SEMI_TRANSPARENT : YELLOW_SEMI_TRANSPARENT)
        }

        gradient.addColorStop(1, type === PKT_T_RLOC ? LIGHT_BLUE_TRANSPARENT : YELLOW_TRANSPARENT)

        ctx.save()

        ctx.beginPath()

        ctx.strokeStyle = gradient
        ctx.lineWidth = 3
        ctx.lineCap = 'round'

        ctx.moveTo(x, y)
        // https://stackoverflow.com/questions/7054272/how-to-draw-smooth-curve-through-n-points-using-javascript-html5-canvas
        ctx.quadraticCurveTo(x1, y1, x2, y2)
        ctx.stroke()

        ctx.restore()

        return true
    }

    _renderBase() {
        const ctx = this._ctx

        ctx.save()

        for (const { t, x, y } of Object.values(ENTITIES)) {
            const { d, c } = STYLES[t]
            ctx.beginPath()
            ctx.fillStyle = c

            const r = Math.floor(d / 2)
            ctx.arc(x, y, r, 0, Math.PI * 2, true)

            ctx.fill()
        }

        ctx.restore()

        // this._drawTravelCurves()
    }

    _drawTravelCurves() {
        const ctx = this._ctx

        ctx.save()
        ctx.lineWidth = 1
        ctx.strokeStyle = '#888'

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

        ctx.restore()
    }

    _getBezierCtlPoints(areaIdx, id1, id2) {
        const curveKey = `${areaIdx}:${Math.min(id1, id2)}:${Math.max(id1, id2)}`
        return this._bezierCtlPoints[curveKey]
    }
}

const PKT_INACTIVE = 0
const PKT_RUNNING = 1

const PKT_T_RLOC = 1
const PKT_T_EID = 2

/**
 * This ugly little class avoids putting pressure on the GC while ***
 */
class PacketBuffer {
    constructor() {
        this._state = pktBufFill(PKT_INACTIVE)
        this._type = pktBufFill(0)
        this._startTime = pktBufFill(0)
        this._totalTime = pktBufFill(0)

        this._startX = pktBufFill(0)
        this._startY = pktBufFill(0)
        this._endX = pktBufFill(0)
        this._endY = pktBufFill(0)

        this._cp1x = pktBufFill(0)
        this._cp1y = pktBufFill(0)
        this._cp2x = pktBufFill(0)
        this._cp2y = pktBufFill(0)
    }

    insert(type, startTime, totalTime, startX, startY, endX, endY, cp1x, cp1y, cp2x, cp2y) {
        const state = this._state

        for (let i = 0; i < SIMULATED_PACKET_MAX; i++) {
            if (state[i] !== PKT_INACTIVE) {
                continue
            }

            state[i] = PKT_RUNNING
            this._type[i] = type
            this._startTime[i] = startTime
            this._totalTime[i] = totalTime
            this._startX[i] = startX
            this._startY[i] = startY
            this._endX[i] = endX
            this._endY[i] = endY
            this._cp1x[i] = cp1x
            this._cp1y[i] = cp1y
            this._cp2x[i] = cp2x
            this._cp2y[i] = cp2y

            return
        }

        throw new Error(`Packet count exceeded (expected max of ${SIMULATED_PACKET_MAX})`)
    }

    update(now, callback) {
        const state = this._state

        for (let i = 0; i < SIMULATED_PACKET_MAX; i++) {
            if (state[i] !== PKT_RUNNING) {
                continue
            }

            let retain = false

            try {
                retain = callback(
                    now,
                    this._type[i],
                    this._startTime[i],
                    this._totalTime[i],
                    this._startX[i],
                    this._startY[i],
                    this._endX[i],
                    this._endY[i],
                    this._cp1x[i],
                    this._cp1y[i],
                    this._cp2x[i],
                    this._cp2y[i]
                )
            } catch (e) {
                console.error('Exception during packet buffer callback:', e)
            }

            if (!retain) {
                state[i] = PKT_INACTIVE
            }
        }
    }
}

function pktBufFill(value) {
    return Array(SIMULATED_PACKET_MAX).fill(value)
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

function getCubicBezierPoint(t, p0x, p0y, cp1x, cp1y, cp2x, cp2y, p3x, p3y) {
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
