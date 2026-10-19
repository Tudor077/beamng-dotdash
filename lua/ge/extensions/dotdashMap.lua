-- DotMap's data, sent to the UI with guihooks:
--   DotMapRoads  the road network, once per map: a flat list of
--                x1, y1, x2, y2, width, drivability (1 = a proper road .. 0 = a track)
--   DotMapCars   every car, every frame: {x, y, dx, dy, me}
-- Loaded by the DotMap app while it is on screen, unloaded when it goes.

local M = {}

local sentFor = nil          -- the node table the roads were last sent for
local sentCount = 0          -- and how many nodes it had
local check = 0

local function r1(v) return math.floor(v * 10 + 0.5) / 10 end

local function sendRoads()
  local m = map.getMap()
  if not m or not m.nodes or next(m.nodes) == nil then return end
  local nodes, out, n = m.nodes, {}, 0
  -- after the game merges the navgraph most links sit on one end only, some on
  -- both: send each pair once, whichever way round it is stored
  local done = {}
  for nid, nd in pairs(nodes) do
    for lid, link in pairs(nd.links) do
      local o = nodes[lid]
      local key, back = tostring(nid) .. "|" .. tostring(lid), tostring(lid) .. "|" .. tostring(nid)
      if o and not done[back] and not link.hiddenInNavi then
        done[key] = true
        out[n + 1] = r1(nd.pos.x); out[n + 2] = r1(nd.pos.y)
        out[n + 3] = r1(o.pos.x);  out[n + 4] = r1(o.pos.y)
        out[n + 5] = r1(nd.radius + o.radius)
        out[n + 6] = r1(link.drivability or 1)
        n = n + 6
      end
    end
  end
  guihooks.trigger("DotMapRoads", out)
  sentFor, sentCount = nodes, tableSize(nodes)
end

local cars = {}
local function onUpdate(dtReal)
  -- map.getMap() is always the same table; the game swaps map.nodes when the
  -- navgraph is (re)built, and may grow it while loading - look every second
  check = check - (dtReal or 0)
  if check <= 0 then
    check = 1
    local m = map.getMap()
    local nodes = m and m.nodes
    if nodes and (nodes ~= sentFor or tableSize(nodes) ~= sentCount) then sendRoads() end
  end
  table.clear(cars)
  local me = be:getPlayerVehicleID(0)
  for id, o in pairs(map.objects) do
    if o.pos and o.dirVec then
      cars[#cars + 1] = {x = o.pos.x, y = o.pos.y, dx = o.dirVec.x, dy = o.dirVec.y, me = id == me}
    end
  end
  guihooks.trigger("DotMapCars", cars)
end

-- the app asks again when it (re)appears: it may have missed the first send
local function requestRoads() sentFor = nil; check = 0 end
local function onNavgraphReloaded() sentFor = nil; check = 0 end
local function onClientPostStartMission() sentFor = nil; check = 0 end

M.onUpdate = onUpdate
M.requestRoads = requestRoads
M.onNavgraphReloaded = onNavgraphReloaded
M.onClientPostStartMission = onClientPostStartMission

return M
