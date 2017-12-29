export function updatePropertyTween(opts) {
    return {
        start: opts.start,
        end: opts.end,
        duration: opts.duration,
        update: function (value) {
            opts.el.style[opts.prop] = value
        },
    }
}

export function reverseTween(tween) {
    var reversed = Object.assign({}, tween, {
        reversed: !tween.reversed,
    })
    return reversed
}

export function classSetAction(opts) {
    return {
        enter: function () {
            opts.el.classList.add(opts.cls)
        },
        exit: function () {
            opts.el.classList.remove(opts.cls)
        },
    }
}

export function appendElemAction(opts) {
    return {
        enter: function () {
            var el = opts.getEl()
            opts.parent.appendChild(el)
            return {
                el: el,
            }
        },
        exit: function (state) {
            var child = state.el
            if (child.parentElement) {
                child.parentElement.removeChild(child)
            }
        },
    }
}