-- CorsaConnect engine info for BeamNG.drive
-- https://github.com/Tudor077/CorsaConnect
--
-- OutGauge sends the rpm but not the rpm range, so the CorsaConnect server
-- had to guess the redline from how the engine behaves. This protocol sends
-- the range itself, read from the same place BeamNG's own tacho apps read it
-- (the vehicle controller's engineInfo: idle rpm and the rev limiter).
--
-- BeamNG loads every file in lua/vehicle/protocols/ as a UDP protocol, gated
-- by Options > Other > Protocols > "Other protocols" (on by default), and only
-- for the car the player is driving. So a car change is just new numbers.

local M = {}

local ADDRESS = "127.0.0.1" -- the CorsaConnect server runs on the same PC
local PORT = 4446           -- next to OutGauge (4444) and MotionSim (4445)
local RATE = 4              -- Hz; the range only changes when the car does

local function getAddress()       return ADDRESS end
local function getPort()          return PORT end
local function getMaxUpdateRate() return RATE end
local function isPhysicsStepUsed() return false end

-- 12 bytes, little-endian. Keep in sync with server/src/engineinfo.rs.
local function getStructDefinition()
  return [[
    char          magic[2];  // "CE"
    unsigned char version;   // 1
    unsigned char flags;     // bit 0: the engine has a rev limiter
    float         idleRpm;
    float         maxRpm;    // the rev limiter when there is one
  ]]
end

local function fillStruct(o, dtSim)
  local info = controller.mainController and controller.mainController.engineInfo
  local idle, max = info and info[1] or 0, info and info[2] or 0
  local engine = powertrain.getDevice("mainEngine")
  if max <= 0 and engine then
    idle, max = engine.idleRPM or 0, engine.maxRPM or 0
  end
  o.magic = "CE"
  o.version = 1
  o.flags = (engine and engine.hasRevLimiter) and 1 or 0
  o.idleRpm = idle
  o.maxRpm = max
end

M.init = nop
M.reset = nop
M.getAddress = getAddress
M.getPort = getPort
M.getMaxUpdateRate = getMaxUpdateRate
M.getStructDefinition = getStructDefinition
M.fillStruct = fillStruct
M.isPhysicsStepUsed = isPhysicsStepUsed

return M
