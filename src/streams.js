// BeamNG streams -> the plain numbers every DotDash widget draws from.
// One place, so the tacho, the boost gauge and the rest can't disagree about
// what "gear" or "fuel" means.

(function (root) {
  "use strict";
  var GEARS_A = ['P', 'R', 'N', 'D', '2', '1'];

  // The gearbox's own name for the gear: electrics.gear, the same value as
  // engineInfo[5]. (engineInfo[13] says "manual" for every car - the game never
  // updates it - so it can't tell a DCT from a manual.)
  //   manual / sequential  a number: 3, 0 for neutral, -1 for reverse
  //   automatic / DCT      "P" "R" "N" "D", "S3" (sport, 3rd), "M4" (manual mode, 4th), "1" "2"
  //   CVT / electric       "P" "R" "N" "D"
  function rawGear(e, info) {
    if (e.gear !== undefined && e.gear !== null && e.gear !== '') return e.gear;
    if (info && info[5] !== undefined && info[5] !== null) return info[5];
    return undefined;
  }

  function isSelector(e, info) {          // P R N D lever, not a stick with numbers
    return typeof rawGear(e, info) === 'string';   // a manual's gear comes as a number
  }

  function gearOf(e, info) {
    var g = rawGear(e, info);
    if (typeof g === 'string') {
      // In D an automatic or DCT is still in a real gear - show it ("D3"),
      // unless the box has only one (electric) or none (CVT).
      if (g === 'D' && e.gearIndex > 0 && e.maxGearIndex > 1) return 'D' + e.gearIndex;
      return g;
    }
    if (g !== undefined) {
      var n = Number(g);
      if (isFinite(n)) return n > 0 ? String(n) : n < 0 ? 'R' : 'N';
    }
    if (e.gear_A !== undefined) return GEARS_A[Math.round(e.gear_A * 5)] || 'D';
    return 'N';
  }

  // The player picks units in the game's options (km/h or mph, bar / kPa / psi,
  // °C / °F). UiUnits is the game's own converter; without it (the browser
  // preview) we fall back to metric.
  function pconv(kpa) {
    var r = root.UiUnits && UiUnits.pressure ? UiUnits.pressure(kpa) : null;
    return r && isFinite(r.val) ? r : { val: kpa / 100, unit: 'Bar' };
  }
  function tconv(c) {
    var r = root.UiUnits && UiUnits.temperature ? UiUnits.temperature(c) : null;
    return r && isFinite(r.val) ? r : { val: c, unit: '°C' };
  }
  function tempText(c) {
    if (c === undefined || c === null || !isFinite(c)) return undefined;
    var r = tconv(c);
    return Math.round(r.val) + (r.unit === 'K' ? 'K' : '°');
  }
  root.dotPressure = pconv;

  // what each widget subscribes to; boost only when the boost gauge is up
  root.DOT_STREAMS = {
    base: ['electrics', 'engineInfo'],
    g: ['sensors'],
    boost: ['forcedInductionInfo']
  };

  root.dotData = function (s) {
    var e = s.electrics;
    if (!e) return null;
    var info = s.engineInfo;
    var speed = e.wheelspeed !== undefined ? e.wheelspeed : (e.airspeed || 0);

    var text, unit;
    if (root.UiUnits && UiUnits.speed) {
      var u = UiUnits.speed(speed);
      if (u && !isNaN(u.val)) { text = String(Math.round(u.val)); unit = u.unit; }
    }

    var gx = 0, gy = 0;
    if (s.sensors && s.sensors.gravity) {
      var gr = -s.sensors.gravity;
      gx = (s.sensors.gx2 !== undefined ? s.sensors.gx2 : s.sensors.gx || 0) / gr;
      gy = (s.sensors.gy2 !== undefined ? s.sensors.gy2 : s.sensors.gy || 0) / gr;
    }

    var boostKpa, maxBoostKpa;
    var fi = s.forcedInductionInfo;
    if (fi && isFinite(fi.boost) && isFinite(fi.maxBoost)) {
      boostKpa = fi.boost;               // the stream is in kPa whatever the UI shows
      maxBoostKpa = fi.maxBoost;
    }

    var rpm = e.rpmTacho !== undefined ? e.rpmTacho : (e.rpm !== undefined ? e.rpm : (info ? info[4] : 0));
    var idle = info ? info[0] : 800;
    return {
      speed: speed, speedText: text, speedUnit: unit,
      rpm: rpm, maxRpm: info ? info[1] : 0, idleRpm: idle,
      gear: gearOf(e, info),
      // for the gear row: what the box has and where it is
      gearbox: isSelector(e, info) ? 'auto' : 'manual',
      gearIndex: e.gearIndex !== undefined ? e.gearIndex : (Number(rawGear(e, info)) || 0),
      gearsF: e.maxGearIndex > 0 ? e.maxGearIndex : (info && info[6] > 0 ? info[6] : 0),
      gearsR: e.minGearIndex < 0 ? -e.minGearIndex : (info && info[7] < 0 ? -info[7] : 0),
      parkingbrake: e.parkingbrake || 0,
      throttle: e.throttle || 0, brake: e.brake || 0, clutch: e.clutch || 0,
      gx: gx, gy: gy,
      water: e.watertemp, oil: e.oiltemp,              // °C, for the warning thresholds
      waterText: tempText(e.watertemp), oilText: tempText(e.oiltemp),
      fuel: info && info[12] ? info[11] / info[12] : undefined,
      abs: !!e.absActive, tcs: !!e.tcsActive,
      handbrake: (e.parkingbrake || 0) > 0.5,
      signalL: !!e.signal_L, signalR: !!e.signal_R,
      highbeam: !!e.highbeam, lowbeam: !!e.lowbeam, fog: (e.fog || 0) > 0,
      lowfuel: !!e.lowfuel,
      ignition: e.ignitionLevel !== undefined ? e.ignitionLevel : (e.ignition ? 2 : 0),
      running: e.engineRunning !== undefined ? !!e.engineRunning : rpm > idle * 0.5,
      boostKpa: boostKpa, maxBoostKpa: maxBoostKpa,
      // for the race apps
      drift: e.dotDrift,                                                   // degrees, from lua/vehicle/extensions/dotdash.lua
      px: s.sensors && s.sensors.position ? s.sensors.position.x : undefined,
      py: s.sensors && s.sensors.position ? s.sensors.position.y : undefined
    };
  };
})(typeof window !== "undefined" ? window : this);
