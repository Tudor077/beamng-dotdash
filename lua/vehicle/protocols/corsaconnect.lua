-- CorsaConnect engine info and haptics for BeamNG.drive
-- https://github.com/Tudor077/CorsaConnect
--
-- OutGauge sends the rpm but not the rpm range, so the CorsaConnect server
-- had to guess the redline from how the engine behaves. This protocol sends
-- the range itself, read from the same place BeamNG's own tacho apps read it
-- (the vehicle controller's engineInfo: idle rpm and the rev limiter).
--
-- It also sends what BeamNG would make a gamepad feel. The game's own
-- lua/vehicle/extensions/input/haptics.lua turns the physics into three
-- vibration channels - the main motor (jerk from bumps and hits, plus tyre
-- slip energy), the throttle trigger (powered wheels spinning) and the brake
-- trigger (wheels locking) - and the phone, which has no controller binding
-- for BeamNG to drive, gets the same three numbers computed the same way.
--
-- BeamNG loads every file in lua/vehicle/protocols/ as a UDP protocol, gated
-- by Options > Other > Protocols > "Other protocols" (on by default), and only
-- for the car the player is driving. So a car change is just new numbers.

local M = {}

local abs, min, max, sqrt = math.abs, math.min, math.max, math.sqrt

local ADDRESS = "127.0.0.1" -- the CorsaConnect server runs on the same PC
local PORT = 4446           -- next to OutGauge (4444) and MotionSim (4445)
local RATE = 30             -- Hz; the rate haptics.lua drives a gamepad at

local function getAddress()       return ADDRESS end
local function getPort()          return PORT end
local function getMaxUpdateRate() return RATE end
local function isPhysicsStepUsed() return false end

-- 24 bytes, little-endian. Keep in sync with server/src/engineinfo.rs.
local function getStructDefinition()
  return [[
    char          magic[2];  // "CE"
    unsigned char version;   // 2
    unsigned char flags;     // bit 0: the engine has a rev limiter, bit 1: ABS working
    float         idleRpm;
    float         maxRpm;    // the rev limiter when there is one
    float         rumble;    // 0..1 the gamepad's main motor: jerk + tyre slip
    float         wheelspin; // 0..1 the throttle trigger: powered wheels spinning
    float         lockup;    // 0..1 the brake trigger: wheels locked under braking
  ]]
end

-- The thresholds and scales below are haptics.lua's, so the phone feels what
-- a gamepad would. The one change: no FFB strength (hydros.wheelFFBForceCoef,
-- 100 by default) - the phone has its own intensity slider.
local JERK_MIN_X, JERK_MIN_Y, JERK_MIN_Z = 50, 20, 15 -- sideways, forward, vertical
local SLIP_ENERGY_MIN = 15000

-- Which wheels are driven, found once per car (wheels aren't there at init).
local powered, poweredCount, wheelCount = {}, 0, 0
local px, py, pz = 0, 0, 0 -- last acceleration, for the jerk
local elapsed = 0          -- sim time since the last packet

local function findWheels()
  powered, poweredCount = {}, 0
  wheelCount = wheels and wheels.wheelCount or 0
  local names = powertrain.getPoweredWheelNames and powertrain.getPoweredWheelNames() or {}
  for index, wheel in pairs(wheels and wheels.wheels or {}) do
    if names[wheel.name] then
      powered[index] = true
      poweredCount = poweredCount + 1
    end
  end
end

local function clamp01(x) return x < 0 and 0 or (x > 1 and 1 or x) end

-- haptics.lua's vibrationUpdate, returning the three channels and ABS.
local function haptics(dt)
  if wheelCount == 0 then findWheels() end
  if dt <= 0 or wheelCount == 0 then return 0, 0, 0, false end
  local ev = electrics.values

  -- Jerk: how fast the acceleration changes - kerbs, bumps, hits.
  local ax, ay, az = sensors.gx2 or 0, sensors.gy2 or 0, sensors.gz2 or 0
  local jx, jy, jz = abs(ax - px) / dt, abs(ay - py) / dt, abs(az - pz) / dt
  px, py, pz = ax, ay, az
  if jx < JERK_MIN_X then jx = 0 end
  if jy < JERK_MIN_Y then jy = 0 end
  if jz < JERK_MIN_Z then jz = 0 end
  local jerk = sqrt(jx * jx + jy * jy + jz * jz) / 325

  -- Nothing below 20% of the speed where the steering FFB is at full force.
  local vx, vy, vz = obj:getSmoothRefVelocityXYZ()
  local fast = (hydros and hydros.ffbSpeedFast) or (5 / 3.6)
  local moving = clamp01((clamp01(sqrt(vx * vx + vy * vy + vz * vz) / fast) - 0.2) / 0.8)

  local airspeed = ev.airspeed or 0
  local brake, throttle = ev.brake or 0, ev.throttle or 0
  local absWorking = ev.absActive == 1 and brake > 0

  local locked, braked, spin = 0, 0, 0
  local top, second = 0, 0
  for index = 0, wheelCount - 1 do
    local wheel = wheels.wheels[index]
    if wheel then
      local e = wheel.slipEnergy or 0
      if e > top then second = top; top = e elseif e > second then second = e end

      local slipRatio = 0
      if airspeed > 0.5 then
        local rim = abs((wheel.angularVelocityBrakeCouple or 0) * (wheel.radius or 0) * (wheel.wheelDir or 1))
        slipRatio = clamp01((airspeed - rim) / airspeed)
      end
      if (wheel.brakeTorque or 0) > 0 and ev.absActive ~= 1 then
        braked = braked + 1
        if slipRatio >= 0.1 and brake > 0 then locked = locked + slipRatio end
      end
      if powered[index] and throttle > 0 and (wheel.lastSlip or 0) > 4 then
        spin = spin + wheel.lastSlip
      end
    end
  end

  local slipEnergy = (top + second) / (wheelCount > 1 and 2 or 1)
  if slipEnergy < SLIP_ENERGY_MIN then slipEnergy = 0 end
  local slip = min(slipEnergy / 600000, 0.2)

  local rumble = min(jerk + slip, 1) * moving
  -- The triggers as haptics.lua scales them for the driver (0..10), back to 0..1.
  local lockedShare = braked > 0 and locked / braked or 0
  local lockup = min(lockedShare / 7 * moving, 1) * 20 / 2 / 10
  local spinAvg = poweredCount > 0 and spin / poweredCount or 0
  local wheelspin = min(spinAvg / 211, 1) * 23 / 2 / 10
  return rumble, clamp01(wheelspin), clamp01(lockup), absWorking
end

local function fillStruct(o, dtSim)
  local info = controller.mainController and controller.mainController.engineInfo
  local idle, maxRpm = info and info[1] or 0, info and info[2] or 0
  local engine = powertrain.getDevice("mainEngine")
  if maxRpm <= 0 and engine then
    idle, maxRpm = engine.idleRPM or 0, engine.maxRPM or 0
  end

  elapsed = elapsed + (dtSim or 0)
  local rumble, wheelspin, lockup, absWorking = haptics(elapsed)
  elapsed = 0

  o.magic = "CE"
  o.version = 2
  o.flags = ((engine and engine.hasRevLimiter) and 1 or 0) + (absWorking and 2 or 0)
  o.idleRpm = idle
  o.maxRpm = maxRpm
  o.rumble = rumble
  o.wheelspin = wheelspin
  o.lockup = lockup
end

-- A new car (or a reset) has other wheels; find them again on the next packet.
local function reset()
  wheelCount, px, py, pz, elapsed = 0, 0, 0, 0, 0
end

M.init = reset
M.reset = reset
M.getAddress = getAddress
M.getPort = getPort
M.getMaxUpdateRate = getMaxUpdateRate
M.getStructDefinition = getStructDefinition
M.fillStruct = fillStruct
M.isPhysicsStepUsed = isPhysicsStepUsed

return M
