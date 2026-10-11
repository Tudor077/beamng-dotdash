// The BeamNG side for every DotDash widget: one Angular directive per app,
// each with its own canvas, all reading the streams through dotData().
// Angular only hosts the canvas - no bindings, no digest per frame.

function dotApp(directive, Widget, streams, opts) {
  opts = opts || {}
  angular.module('beamng.apps').directive(directive, [function () {
    return {
      // no border, outline or background of our own anywhere: the canvas is the app
      template: '<div style="width:100%; height:100%; position:relative; border:0; outline:none; background:transparent; overflow:hidden;">' +
                '<canvas style="width:100%; height:100%; display:block; border:0; outline:none; background:transparent;"></canvas></div>',
      replace: true,
      restrict: 'EA',
      link: function (scope, element) {
        var root = element[0]
        var w = new Widget(root.querySelector('canvas'))
        StreamsManager.add(streams)
        var ro = window.ResizeObserver ? new ResizeObserver(function () { w.resize() }) : null
        if (ro) ro.observe(root)
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { w.resize() })
        if (opts.link) opts.link(root, w, scope)
        scope.$on('streamsUpdate', function (event, s) { w.update(dotData(s)) })
        scope.$on('$destroy', function () {
          StreamsManager.remove(streams)
          if (ro) ro.disconnect()
          if (opts.unlink) opts.unlink(root, w)
        })
      }
    }
  }])
}

// The engine button and the drivetrain buttons round it.
//
// Start/stop: the same calls the stock powertrain app makes - down then up
// toggles the ignition; holding it down cranks the starter, like the key.
//
// Drivetrain: the game's ui_simplePowertrainControl extension sends one
// ChangePowerTrainButtons event per control (diff locks, range box, 4WD, hubs,
// ESC, drive modes, N2O, JATO) once updateButtons() is asked for, and again
// whenever one changes. A click runs the Lua the event came with.
function startStopLink(root, w, scope) {
  var lua = function (s) { bngApi.activeObjectLua(s) }
  var refresh = function () { lua('extensions.ui_simplePowertrainControl.updateButtons()') }
  var redraw = function () { if (w.data) w.draw() }

  scope.$on('ChangePowerTrainButtons', function (event, b) {
    if (!b || !b.id) return
    var i = w.buttons.map(function (x) { return x.id }).indexOf(b.id)
    if (b.remove) { if (i > -1) w.buttons.splice(i, 1) }
    else if (i > -1) w.buttons[i] = Object.assign({}, w.buttons[i], b)
    else w.buttons.push(b)
    redraw()
  })
  var fresh = function () { w.buttons = []; w.hover = null; refresh(); redraw() }
  scope.$on('VehicleChange', fresh)
  scope.$on('VehicleFocusChanged', fresh)
  refresh()

  var at = function (e) {
    var r = root.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top
    var L = dotStartLayout(r.width, r.height, w.buttons.length)
    for (var k = 0; k < L.spots.length; k++) {
      var p = L.spots[k]
      if ((x - p.x) * (x - p.x) + (y - p.y) * (y - p.y) <= p.r * p.r * 1.2) return { button: k }
    }
    if ((x - L.cx) * (x - L.cx) + (y - L.cy) * (y - L.cy) <= L.inner * L.inner) return { start: true }
    return {}
  }
  var press = function (e) {
    var hit = at(e)
    if (hit.button !== undefined) {
      e.preventDefault()
      var b = w.buttons[hit.button]
      if (b && b.onClick) lua(b.onClick)
      setTimeout(refresh, 120)                    // ask for the new state
      return
    }
    if (!hit.start) return
    e.preventDefault()
    w.pressed = true
    lua('electrics.toggleIgnitionLevelOnDown()')
    redraw()
  }
  var release = function () {
    if (!w.pressed) return
    w.pressed = false
    lua('electrics.toggleIgnitionLevelOnUp()')
    redraw()
  }
  var move = function (e) {
    var hit = at(e), h = hit.button !== undefined ? hit.button : null
    root.style.cursor = (h !== null || hit.start) ? 'pointer' : 'default'
    if (h !== w.hover) { w.hover = h; redraw() }
  }
  var leave = function () { release(); if (w.hover !== null) { w.hover = null; redraw() } }
  root.addEventListener('mousedown', press)
  root.addEventListener('mouseup', release)
  root.addEventListener('mousemove', move)
  root.addEventListener('mouseleave', leave)
  w._unbind = function () {
    root.removeEventListener('mousedown', press)
    root.removeEventListener('mouseup', release)
    root.removeEventListener('mousemove', move)
    root.removeEventListener('mouseleave', leave)
  }
}
