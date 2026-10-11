// BeamNG streams -> the plain numbers every DotDash widget draws from.
// One place, so the tacho, the boost gauge and the rest can't disagree about
// what "gear" or "fuel" means.

(function (root) {
  "use strict";
  var GEARS_A = ['P', 'R', 'N', 'D', '2', '1'];

  function gearOf(e, info) {
    if (info && info[13] === 'manual') {
      var g = info[5];
      return g > 0 ? String(g) : g < 0 ? 'R' : 'N';
    }
    // electrics.gear is what the gearbox itself calls the gear:
    //   automatic / DCT  "P" "R" "N" "D", "S3" (sport, 3rd), "M4" (manual mode, 4th), "1" "2"
    //   sequential       a plain number (2), 0 for neutral, -1 for reverse
    if (typeof e.gear === 'string' && e.gear.length) return e.gear;
    if (typeof e.gear === 'number' && isFinite(e.gear)) return e.gear > 0 ? String(e.gear) : e.gear < 0 ? 'R' : 'N';
    if (e.gear_A !== undefined) return GEARS_A[Math.round(e.gear_A * 5)] || 'D';
    if (info && info[5] !== undefined) {
      var n = info[5];
      return n > 0 ? String(n) : n < 0 ? 'R' : 'N';
    }
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
      gearbox: info ? info[13] : undefined,
      gearIndex: info ? info[5] : 0,
      gearsF: info && info[6] > 0 ? info[6] : 0,
      gearsR: info && info[7] > 0 ? info[7] : 0,
      parkingbrake: e.parkingbrake || 0,
      throttle: e.throttle || 0, brake: e.brake || 0, clutch: e.clutch || 0,
      gx: gx, gy: gy,
      water: e.watertemp, oil: e.oiltemp,              // °C, for the warning thresholds
      waterText: tempText(e.watertemp), oilText: tempText(e.oiltemp),
      fuel: info && info[12] ? info[11] / info[12] : undefined,
      abs: !!e.absActive, tcs: !!e.tcsActive,
      handbrake: (e.parkingbrake || 0) > 0.5,
      signalL: !!e.signal_L, signalR: !!e.signal_R,
      highbeam: !!e.highbeam, lowbeam: !!e.lowbeam,
      lowfuel: !!e.lowfuel,
      ignition: e.ignitionLevel !== undefined ? e.ignitionLevel : (e.ignition ? 2 : 0),
      running: e.engineRunning !== undefined ? !!e.engineRunning : rpm > idle * 0.5,
      boostKpa: boostKpa, maxBoostKpa: maxBoostKpa
    };
  };
})(typeof window !== "undefined" ? window : this);
