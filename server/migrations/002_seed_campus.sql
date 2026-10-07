-- Sample campus data lifted from SafeRoute_prototype.html (R, W, TT, M, HP).
-- Coordinates: the prototype's 600x380 SVG space mapped linearly to ~1.0 km x ~0.7 km around a PLACEHOLDER anchor
-- (lat 20, lng 78). Replace map_nodes / help_points with surveyed campus coordinates before real use.

INSERT INTO travel_modes (code, label, speed_kmh) VALUES
 ('walking','Walking',5),('cycling','Cycling',14),('campus_ride','Campus ride',20);

INSERT INTO time_slots (code, label, start_hour, end_hour, w_lighting, w_activity, w_help, w_reports) VALUES
 ('day','Day · 2 pm',6,17,0.15,0.25,0.25,0.35),
 ('evening','Evening · 7 pm',17,21,0.3,0.25,0.2,0.25),
 ('night','Night · 11 pm',21,6,0.4,0.2,0.2,0.2);

INSERT INTO map_nodes (code, name, node_type, lat, lng) VALUES
 ('library','Central Library','landmark',20.000000,78.000000),
 ('hostel-c','Hostel Block C','landmark',20.006500,78.010000);

INSERT INTO map_nodes (code, name, node_type, lat, lng) VALUES
 ('fastest-1',NULL,'waypoint',20.002000,78.003000),
 ('fastest-2',NULL,'waypoint',20.004250,78.006200),
 ('balanced-1',NULL,'waypoint',20.003000,78.001600),
 ('balanced-2',NULL,'waypoint',20.003500,78.005600),
 ('balanced-3',NULL,'waypoint',20.005250,78.008000),
 ('safest-1',NULL,'waypoint',20.004250,78.000400),
 ('safest-2',NULL,'waypoint',20.005875,78.003200),
 ('safest-3',NULL,'waypoint',20.006250,78.007400);

SET @lib = (SELECT id FROM map_nodes WHERE code='library'), @host = (SELECT id FROM map_nodes WHERE code='hostel-c');

INSERT INTO routes (code, label, area_name, origin_node_id, destination_node_id, distance_km, base_report_score, sort_order) VALUES
 ('fastest','Fastest','Market lane',@lib,@host,1.2,62,1),
 ('balanced','Balanced','Park road',@lib,@host,1.4,80,2),
 ('safest','Safest','Main avenue',@lib,@host,1.7,90,3);

SET @rid = (SELECT id FROM routes WHERE code='fastest' AND origin_node_id=@lib AND destination_node_id=@host);
INSERT INTO route_waypoints (route_id, seq, node_id) VALUES (@rid,1,@lib),(@rid,2,(SELECT id FROM map_nodes WHERE code='fastest-1')),(@rid,3,(SELECT id FROM map_nodes WHERE code='fastest-2')),(@rid,4,@host);
INSERT INTO route_time_profiles (route_id, time_slot_id, lighting, activity, help) VALUES (@rid,(SELECT id FROM time_slots WHERE code='day'),78,70,40),(@rid,(SELECT id FROM time_slots WHERE code='evening'),52,48,40),(@rid,(SELECT id FROM time_slots WHERE code='night'),28,22,40);

SET @rid = (SELECT id FROM routes WHERE code='balanced' AND origin_node_id=@lib AND destination_node_id=@host);
INSERT INTO route_waypoints (route_id, seq, node_id) VALUES (@rid,1,@lib),(@rid,2,(SELECT id FROM map_nodes WHERE code='balanced-1')),(@rid,3,(SELECT id FROM map_nodes WHERE code='balanced-2')),(@rid,4,(SELECT id FROM map_nodes WHERE code='balanced-3')),(@rid,5,@host);
INSERT INTO route_time_profiles (route_id, time_slot_id, lighting, activity, help) VALUES (@rid,(SELECT id FROM time_slots WHERE code='day'),85,75,60),(@rid,(SELECT id FROM time_slots WHERE code='evening'),72,65,60),(@rid,(SELECT id FROM time_slots WHERE code='night'),58,50,60);

SET @rid = (SELECT id FROM routes WHERE code='safest' AND origin_node_id=@lib AND destination_node_id=@host);
INSERT INTO route_waypoints (route_id, seq, node_id) VALUES (@rid,1,@lib),(@rid,2,(SELECT id FROM map_nodes WHERE code='safest-1')),(@rid,3,(SELECT id FROM map_nodes WHERE code='safest-2')),(@rid,4,(SELECT id FROM map_nodes WHERE code='safest-3')),(@rid,5,@host);
INSERT INTO route_time_profiles (route_id, time_slot_id, lighting, activity, help) VALUES (@rid,(SELECT id FROM time_slots WHERE code='day'),92,78,82),(@rid,(SELECT id FROM time_slots WHERE code='evening'),88,74,82),(@rid,(SELECT id FROM time_slots WHERE code='night'),84,66,82);

INSERT INTO help_points (type, name, lat, lng) VALUES
 ('security_booth','Security booth',20.002625,78.000360),
 ('medical_point','Medical point',20.005625,78.003300),
 ('security_booth','Security booth',20.003375,78.005700),
 ('help_desk','Help desk',20.006050,78.007200),
 ('security_booth','Security booth',20.005050,78.008100);
