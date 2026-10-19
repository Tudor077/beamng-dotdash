-- DotDash's own numbers, written into electrics so the UI apps get them with
-- everything else in the electrics stream. Loaded by the apps that need it
-- (DotDrift), into whichever car the player drives.
--
--   electrics.values.dotDrift   the drift angle in degrees: where the nose
--                               points against where the car is going,
--                               + = nose to the right of the path. 0 when slow.

local M = {}

local deg = 180 / math.pi

local function updateGFX(dt)
  local ev = electrics.values
  local vel = obj:getVelocity()
  if vel:length() < 3 then             -- below ~10 km/h the direction of travel is noise
    ev.dotDrift = 0
    return
  end
  local dir = obj:getDirectionVector()
  local right = dir:cross(obj:getDirectionVectorUp())
  -- velocity to the left of the nose = the nose is pointing right of the path
  ev.dotDrift = math.atan2(-vel:dot(right), vel:dot(dir)) * deg
end

M.updateGFX = updateGFX

return M
