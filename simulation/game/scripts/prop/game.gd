@tool
extends Node2D

@export var fix_tileset_library: bool = false :
	set(value):
		fix_tileset_library = false 
		if Engine.is_editor_hint():
			print("--- 🚀 เริ่มต้นสแกนหาผีใน TileSet ---")
			_repair_tileset_bug()

func _repair_tileset_bug():
	var bg_node = get_node_or_null("background")
	if bg_node == null:
		print("❌ ไม่พบโหนด background!")
		return
		
	print("✅ เจอโหนด background แล้ว กำลังดึงคลัง TileSet...")
	
	var target_tileset = null
	
	# วนหา TileSet จากทุกเลเยอร์ (เจออันแรกเอาเลย เพราะมันแชร์กัน)
	for child in bg_node.get_children():
		if child is TileMapLayer and child.tile_set != null:
			target_tileset = child.tile_set
			print("✅ เจอคลัง TileSet ที่ใช้กับเลเยอร์: ", child.name)
			break 
			
	if target_tileset == null:
		print("❌ ไม่พบ TileSet ในเลเยอร์ไหนเลย!")
		return
		
	var total_removed = 0
	
	for i in range(target_tileset.get_source_count()):
		var source_id = target_tileset.get_source_id(i)
		var source = target_tileset.get_source(source_id)
		
		if source is TileSetAtlasSource:
			print("🔍 กำลังสแกนแผ่นกระเบื้อง...")
			for x in range(10, 100):
				for y in range(0, 100):
					var coord = Vector2i(x, y)
					if source.has_tile(coord):
						source.remove_tile(coord)
						total_removed += 1
						
	if total_removed > 0:
		print("🎉 สำเร็จ! ลบความจำผีใน TileSet ไปทั้งหมด ", total_removed, " จุด! (กด Ctrl+S เซฟฉากเลย!)")
	else:
		print("🤷‍♂️ สแกนเสร็จแล้ว ไม่พบกระเบื้องผีเลยครับ!")
